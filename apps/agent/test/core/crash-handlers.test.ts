import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installCrashHandlers } from '../../src/core/crash-handlers.js';

function setup(): {
  emitter: EventEmitter;
  fatal: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
} {
  const emitter = new EventEmitter();
  const fatal = vi.fn();
  const exit = vi.fn();
  installCrashHandlers({ logger: { fatal }, exit, process: emitter });
  return { emitter, fatal, exit };
}

describe('installCrashHandlers', () => {
  it('logs the error class and exits non-zero on an unhandled rejection', () => {
    const { emitter, fatal, exit } = setup();

    emitter.emit('unhandledRejection', new TypeError('window title: secret'));

    expect(fatal).toHaveBeenCalledWith(
      { event: 'unhandledRejection', error: 'TypeError' },
      'agent crashed',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does the same for an uncaught exception, even a non-error', () => {
    const { emitter, fatal, exit } = setup();

    emitter.emit('uncaughtException', 'boom');

    expect(fatal).toHaveBeenCalledWith(
      { event: 'uncaughtException', error: 'string' },
      'agent crashed',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
