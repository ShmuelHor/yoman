import type {
  MethodCall,
  SessionBus,
  SignalHandler,
  SignalMatch,
  Unsubscribe,
} from '../../../src/core/session-bus.js';

/**
 * A fake session bus with a notification server and a desktop portal.
 * `Notify` answers with the next id; `emit` fires a signal the way the real
 * bus would, only to subscribers of that member.
 */
export class FakeNotificationServer implements SessionBus {
  readonly calls: MethodCall[] = [];
  readonly subscriptions: SignalMatch[] = [];
  unsubscribed = 0;
  private nextId = 1;
  private readonly handlers = new Map<string, SignalHandler>();

  constructor(
    private readonly options: {
      readonly notifyReply?: (id: number) => readonly unknown[];
      readonly failCall?: (call: MethodCall) => Error | undefined;
      readonly failSubscribe?: (match: SignalMatch) => Error | undefined;
    } = {},
  ) {}

  call(call: MethodCall): Promise<readonly unknown[]> {
    this.calls.push(call);
    const failure = this.options.failCall?.(call);
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    if (call.member !== 'Notify') {
      return Promise.resolve([]);
    }
    const id = this.nextId;
    this.nextId += 1;
    return Promise.resolve(this.options.notifyReply?.(id) ?? [id]);
  }

  subscribe(match: SignalMatch, handler: SignalHandler): Promise<Unsubscribe> {
    const failure = this.options.failSubscribe?.(match);
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    this.subscriptions.push(match);
    this.handlers.set(match.member, handler);
    return Promise.resolve(() => {
      this.unsubscribed += 1;
      this.handlers.delete(match.member);
      return Promise.resolve();
    });
  }

  close(): void {
    this.handlers.clear();
  }

  emit(member: 'ActionInvoked' | 'NotificationClosed', body: readonly unknown[]): void {
    this.handlers.get(member)?.(body);
  }

  calledMembers(): string[] {
    return this.calls.map((call) => call.member);
  }
}
