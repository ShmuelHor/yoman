import { Message, MessageType, sessionBus } from 'dbus-next';
import { z } from 'zod';

/** A method call; every field comes from a plugin's constants, never from outside input. */
export interface MethodCall {
  readonly destination: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
  readonly signature?: string;
  readonly body?: readonly unknown[];
}

/** A signal from one well-known name; signals from any other sender are dropped. */
export interface SignalMatch {
  readonly sender: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
}

/** Gets the signal body unparsed: it is outside input, and each plugin parses it with zod. */
export type SignalHandler = (body: readonly unknown[]) => void;

export type Unsubscribe = () => Promise<void>;

/**
 * One shared session-bus connection for every plugin (window, idle, lock,
 * app-discovery, notifier). It connects on first use, so an agent with no
 * D-Bus plugin never opens a socket.
 */
export interface SessionBus {
  /** Resolves with the reply body, unparsed. Rejects with a `SessionBusError`. */
  call(call: MethodCall): Promise<readonly unknown[]>;
  subscribe(match: SignalMatch, handler: SignalHandler): Promise<Unsubscribe>;
  /** Disconnects; the next call connects again. Called once on agent shutdown. */
  close(): void;
}

/** The part of dbus-next's `MessageBus` the helper uses, so tests can fake it. */
export interface BusConnection {
  call(message: Message): Promise<Message | null>;
  on(event: 'message', listener: (message: Message) => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  removeListener(event: 'message', listener: (message: Message) => void): unknown;
  disconnect(): void;
}

export type SessionBusErrorCode = 'UNAVAILABLE' | 'TIMEOUT' | 'NO_REPLY' | 'CALL_FAILED';

export class SessionBusError extends Error {
  override readonly name = 'SessionBusError';

  constructor(
    readonly code: SessionBusErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface SessionBusOptions {
  readonly connect?: () => BusConnection;
  /**
   * Errors no caller can catch: a dropped connection (the next call
   * reconnects) or a signal handler that threw.
   */
  readonly onError: (error: unknown) => void;
  readonly timeoutMs?: number;
}

/** Well under the 5 s polling interval, so a hung peer never stalls a collector's schedule. */
export const DBUS_CALL_TIMEOUT_MS = 2_000;

const DBUS = {
  destination: 'org.freedesktop.DBus',
  path: '/org/freedesktop/DBus',
  interface: 'org.freedesktop.DBus',
} as const;

/** The D-Bus specification's limit for every name. */
const MAX_NAME_LENGTH = 255;
/** Match rule values are quoted, so a quote or a comma must never reach one. */
const RuleValue = z
  .string()
  .regex(/^[A-Za-z0-9_.:/-]+$/)
  .max(MAX_NAME_LENGTH);
const MatchRule = z.strictObject({
  sender: RuleValue,
  path: RuleValue,
  interface: RuleValue,
  member: RuleValue,
});
const NameOwnerReply = z.tuple([z.string().min(1).max(MAX_NAME_LENGTH)]);

/** D-Bus error names, such as `org.freedesktop.DBus.Error.ServiceUnknown`, are safe to log. */
const DbusErrorName = z.object({ type: RuleValue });

function matchRule(match: SignalMatch): string {
  const rule = MatchRule.parse(match);
  return [
    "type='signal'",
    `sender='${rule.sender}'`,
    `path='${rule.path}'`,
    `interface='${rule.interface}'`,
    `member='${rule.member}'`,
  ].join(',');
}

function callFailed(error: unknown): SessionBusError {
  const name = DbusErrorName.safeParse(error);
  const reason = name.success ? name.data.type : 'unknown error';
  return new SessionBusError('CALL_FAILED', `D-Bus call failed: ${reason}`, { cause: error });
}

export function createSessionBus(options: SessionBusOptions): SessionBus {
  const connector = options.connect ?? ((): BusConnection => sessionBus());
  const timeoutMs = options.timeoutMs ?? DBUS_CALL_TIMEOUT_MS;
  let connection: BusConnection | undefined;

  function connect(): BusConnection {
    if (connection !== undefined) {
      return connection;
    }
    let created: BusConnection;
    try {
      created = connector();
    } catch (error: unknown) {
      throw new SessionBusError('UNAVAILABLE', 'session bus is unavailable', { cause: error });
    }
    created.on('error', (error) => {
      // Without a listener, an 'error' event would crash the agent.
      if (connection === created) {
        connection = undefined;
        created.disconnect();
      }
      options.onError(error);
    });
    connection = created;
    return created;
  }

  async function withTimeout(reply: Promise<Message | null>): Promise<Message | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new SessionBusError('TIMEOUT', `no D-Bus reply within ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([reply, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(method: MethodCall): Promise<readonly unknown[]> {
    const bus = connect();
    const message = new Message({
      type: MessageType.METHOD_CALL,
      destination: method.destination,
      path: method.path,
      interface: method.interface,
      member: method.member,
      ...(method.signature === undefined ? {} : { signature: method.signature }),
      ...(method.body === undefined ? {} : { body: [...method.body] }),
    });
    let reply: Message | null;
    try {
      reply = await withTimeout(bus.call(message));
    } catch (error: unknown) {
      throw error instanceof SessionBusError ? error : callFailed(error);
    }
    if (reply === null) {
      throw new SessionBusError('NO_REPLY', 'D-Bus call returned no reply');
    }
    // dbus-next types the body as `any[]`; callers get `unknown` and parse it.
    const body: readonly unknown[] = reply.body;
    return body;
  }

  /** The unique name (`:1.42`) that owns `name` now, or undefined while nobody does. */
  async function ownerOf(name: string): Promise<string | undefined> {
    try {
      const body = await call({ ...DBUS, member: 'GetNameOwner', signature: 's', body: [name] });
      const [owner] = NameOwnerReply.parse(body);
      return owner;
    } catch {
      // NameHasNoOwner: the service is not running yet, which is expected, not a fault.
      return undefined;
    }
  }

  async function subscribe(match: SignalMatch, handler: SignalHandler): Promise<Unsubscribe> {
    const rule = matchRule(match);
    const bus = connect();
    let owner = await ownerOf(match.sender);

    async function fromOwner(sender: string): Promise<boolean> {
      if (sender === owner) {
        return true;
      }
      // The owner may have restarted under a new unique name; anyone else is spoofing.
      owner = await ownerOf(match.sender);
      return sender === owner;
    }

    const listener = (message: Message): void => {
      if (
        message.type !== MessageType.SIGNAL ||
        message.path !== match.path ||
        message.interface !== match.interface ||
        message.member !== match.member
      ) {
        return;
      }
      const body: readonly unknown[] = message.body;
      fromOwner(message.sender)
        .then((trusted) => {
          if (trusted) {
            handler(body);
          }
        })
        .catch(options.onError);
    };

    bus.on('message', listener);
    try {
      await call({ ...DBUS, member: 'AddMatch', signature: 's', body: [rule] });
    } catch (error: unknown) {
      bus.removeListener('message', listener);
      throw error;
    }
    return async (): Promise<void> => {
      bus.removeListener('message', listener);
      if (connection === bus) {
        await call({ ...DBUS, member: 'RemoveMatch', signature: 's', body: [rule] });
      }
    };
  }

  return {
    call,
    subscribe,
    close(): void {
      const open = connection;
      connection = undefined;
      open?.disconnect();
    },
  };
}
