import { describe, expect, it, vi } from 'vitest';

import { type CrashProcess, installCrashHandlers } from '../src/crash-handlers.js';

function fakeProcess(): { proc: CrashProcess; emit: (event: string, reason: unknown) => void } {
  const listeners = new Map<string, (reason: unknown) => void>();
  const proc: CrashProcess = {
    on: (event, listener) => {
      listeners.set(event, listener);
    },
    exit: vi.fn(),
  };
  return { proc, emit: (event, reason) => listeners.get(event)?.(reason) };
}

describe('installCrashHandlers', () => {
  it.each(['uncaughtException', 'unhandledRejection'])(
    'logs %s once and exits non-zero so the supervisor restarts the process',
    (event) => {
      const fatal = vi.fn();
      const { proc, emit } = fakeProcess();
      installCrashHandlers({ fatal }, proc);

      emit(event, new Error('boom'));

      expect(fatal).toHaveBeenCalledTimes(1);
      expect(fatal.mock.calls[0]?.[0]).toMatchObject({ event });
      expect(proc.exit).toHaveBeenCalledWith(1);
    },
  );
});
