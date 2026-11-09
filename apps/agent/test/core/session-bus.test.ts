import { EventEmitter } from 'node:events';
import { DBusError, Message, MessageType } from 'dbus-next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type BusConnection,
  createSessionBus,
  DBUS_CALL_TIMEOUT_MS,
  type SessionBus,
  type SignalMatch,
} from '../../src/core/session-bus.js';

const OWNER = ':1.42';
const IDLE_MS = 7n;
const SCREENSAVER: SignalMatch = {
  sender: 'org.gnome.ScreenSaver',
  path: '/org/gnome/ScreenSaver',
  interface: 'org.gnome.ScreenSaver',
  member: 'ActiveChanged',
};
const IDLETIME = {
  destination: 'org.gnome.Mutter.IdleMonitor',
  path: '/org/gnome/Mutter/IdleMonitor/Core',
  interface: 'org.gnome.Mutter.IdleMonitor',
  member: 'GetIdletime',
};

type Responder = (message: Message) => Promise<Message | null>;

/** An in-memory bus: replies come from `respond`, signals from `signal`. */
class FakeConnection extends EventEmitter implements BusConnection {
  readonly calls: Message[] = [];
  disconnected = false;

  constructor(private readonly respond: Responder) {
    super();
  }

  call(message: Message): Promise<Message | null> {
    this.calls.push(message);
    return this.respond(message);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  signal(sender: string, body: unknown[], overrides: Partial<SignalMatch> = {}): void {
    const match = { ...SCREENSAVER, ...overrides };
    const message = new Message({
      type: MessageType.SIGNAL,
      sender,
      path: match.path,
      interface: match.interface,
      member: match.member,
      signature: 'b',
      body,
    });
    this.emit('message', message);
  }

  members(): string[] {
    return this.calls.map((message) => message.member);
  }
}

function reply(body: unknown[]): Promise<Message> {
  return Promise.resolve(new Message({ type: MessageType.METHOD_RETURN, replySerial: '1', body }));
}

/** Answers GetNameOwner with `owner`, AddMatch and RemoveMatch with nothing, the rest with `body`. */
function responder(options: { owner?: () => string; body?: unknown[] } = {}): Responder {
  return (message) => {
    if (message.member === 'GetNameOwner') {
      return reply([options.owner?.() ?? OWNER]);
    }
    if (message.member === 'AddMatch' || message.member === 'RemoveMatch') {
      return reply([]);
    }
    return reply(options.body ?? []);
  };
}

function busOver(connection: BusConnection, onError = vi.fn()): SessionBus {
  return createSessionBus({ connect: () => connection, onError });
}

/** Lets the owner check's promise chain settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('createSessionBus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not connect until the first call', async () => {
    // Arrange
    const connect = vi.fn(() => new FakeConnection(responder({ body: [IDLE_MS] })));
    const bus = createSessionBus({ connect, onError: vi.fn() });

    // Act / Assert
    expect(connect).not.toHaveBeenCalled();
    expect(await bus.call(IDLETIME)).toEqual([IDLE_MS]);
    await bus.call(IDLETIME);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('sends the method call as given', async () => {
    // Arrange
    const connection = new FakeConnection(responder());
    const bus = busOver(connection);

    // Act
    await bus.call(IDLETIME);

    // Assert
    expect(connection.calls[0]).toMatchObject({ type: MessageType.METHOD_CALL, ...IDLETIME });
  });

  it('reports a bus that cannot be reached as unavailable', async () => {
    // Arrange
    const bus = createSessionBus({
      connect: () => {
        throw new Error('no DBUS_SESSION_BUS_ADDRESS');
      },
      onError: vi.fn(),
    });

    // Act / Assert
    await expect(bus.call(IDLETIME)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('names the D-Bus error of a failed call', async () => {
    // Arrange
    const connection = new FakeConnection(() =>
      Promise.reject(new DBusError('org.freedesktop.DBus.Error.ServiceUnknown', 'secret detail')),
    );

    // Act
    const failure = busOver(connection).call(IDLETIME);

    // Assert
    await expect(failure).rejects.toMatchObject({
      code: 'CALL_FAILED',
      message: 'D-Bus call failed: org.freedesktop.DBus.Error.ServiceUnknown',
    });
  });

  it('rejects a call with no reply', async () => {
    // Arrange
    const connection = new FakeConnection(() => Promise.resolve(null));

    // Act / Assert
    await expect(busOver(connection).call(IDLETIME)).rejects.toMatchObject({ code: 'NO_REPLY' });
  });

  it('gives up on a peer that never replies', async () => {
    // Arrange
    vi.useFakeTimers();
    const connection = new FakeConnection(() => new Promise<never>(() => undefined));
    const failure = busOver(connection).call(IDLETIME);
    const assertion = expect(failure).rejects.toMatchObject({ code: 'TIMEOUT' });

    // Act
    await vi.advanceTimersByTimeAsync(DBUS_CALL_TIMEOUT_MS);

    // Assert
    await assertion;
  });

  it('reconnects on the next call after the connection drops', async () => {
    // Arrange
    const first = new FakeConnection(responder());
    const second = new FakeConnection(responder());
    const connect = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onError = vi.fn();
    const bus = createSessionBus({ connect, onError });
    await bus.call(IDLETIME);
    const dropped = new Error('socket closed');

    // Act
    first.emit('error', dropped);
    await bus.call(IDLETIME);

    // Assert
    expect(onError).toHaveBeenCalledWith(dropped);
    expect(first.disconnected).toBe(true);
    expect(second.calls).toHaveLength(1);
  });

  it('disconnects on close', async () => {
    // Arrange
    const connection = new FakeConnection(responder());
    const bus = busOver(connection);
    await bus.call(IDLETIME);

    // Act
    bus.close();

    // Assert
    expect(connection.disconnected).toBe(true);
  });

  describe('subscribe', () => {
    it('adds a match rule for the signal and removes it on unsubscribe', async () => {
      // Arrange
      const connection = new FakeConnection(responder());
      const bus = busOver(connection);

      // Act
      const unsubscribe = await bus.subscribe(SCREENSAVER, vi.fn());
      await unsubscribe();

      // Assert
      const rule =
        "type='signal',sender='org.gnome.ScreenSaver',path='/org/gnome/ScreenSaver'," +
        "interface='org.gnome.ScreenSaver',member='ActiveChanged'";
      expect(connection.calls.filter((call) => call.member.endsWith('Match'))).toEqual([
        expect.objectContaining({ member: 'AddMatch', body: [rule] }),
        expect.objectContaining({ member: 'RemoveMatch', body: [rule] }),
      ]);
      expect(connection.listenerCount('message')).toBe(0);
    });

    it('delivers the body of a signal from the name owner', async () => {
      // Arrange
      const connection = new FakeConnection(responder());
      const handler = vi.fn();
      await busOver(connection).subscribe(SCREENSAVER, handler);

      // Act
      connection.signal(OWNER, [true]);
      await settle();

      // Assert
      expect(handler).toHaveBeenCalledWith([true]);
    });

    it('drops a spoofed signal from another sender', async () => {
      // Arrange
      const connection = new FakeConnection(responder());
      const handler = vi.fn();
      await busOver(connection).subscribe(SCREENSAVER, handler);

      // Act
      connection.signal(':1.99', [true]);
      await settle();

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    it('follows the owner when the service restarts under a new name', async () => {
      // Arrange
      let owner = OWNER;
      const connection = new FakeConnection(responder({ owner: () => owner }));
      const handler = vi.fn();
      await busOver(connection).subscribe(SCREENSAVER, handler);
      owner = ':1.77';

      // Act
      connection.signal(':1.77', [false]);
      await settle();

      // Assert
      expect(handler).toHaveBeenCalledWith([false]);
    });

    it('ignores other signals on the same connection', async () => {
      // Arrange
      const connection = new FakeConnection(responder());
      const handler = vi.fn();
      await busOver(connection).subscribe(SCREENSAVER, handler);

      // Act
      connection.signal(OWNER, [true], { member: 'WakeUpScreen' });
      await settle();

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    it('reports a handler that throws instead of crashing', async () => {
      // Arrange
      const connection = new FakeConnection(responder());
      const onError = vi.fn();
      const broken = new Error('handler bug');
      await busOver(connection, onError).subscribe(SCREENSAVER, () => {
        throw broken;
      });

      // Act
      connection.signal(OWNER, [true]);
      await settle();

      // Assert
      expect(onError).toHaveBeenCalledWith(broken);
    });

    it('rejects a match value that could break out of its quotes', async () => {
      // Arrange
      const bus = busOver(new FakeConnection(responder()));

      // Act / Assert
      await expect(
        bus.subscribe({ ...SCREENSAVER, member: "x',eavesdrop='true" }, vi.fn()),
      ).rejects.toThrow();
    });

    it('detaches its listener when the match cannot be added', async () => {
      // Arrange
      const connection = new FakeConnection((message) =>
        message.member === 'AddMatch'
          ? Promise.reject(new DBusError('org.freedesktop.DBus.Error.LimitsExceeded', ''))
          : reply([OWNER]),
      );

      // Act
      const subscription = busOver(connection).subscribe(SCREENSAVER, vi.fn());

      // Assert
      await expect(subscription).rejects.toMatchObject({ code: 'CALL_FAILED' });
      expect(connection.listenerCount('message')).toBe(0);
    });
  });
});
