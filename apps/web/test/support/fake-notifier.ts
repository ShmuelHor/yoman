import { vi } from 'vitest';

import type { Notifier } from '../../src/notify/notifier.js';

/** A notifier whose toasts are spies, for tests of code that raises them. */
export function fakeNotifier(): { [K in keyof Notifier]: ReturnType<typeof vi.fn<Notifier[K]>> } {
  return {
    success: vi.fn<Notifier['success']>(),
    info: vi.fn<Notifier['info']>(),
    warning: vi.fn<Notifier['warning']>(),
    error: vi.fn<Notifier['error']>(),
    connect: vi.fn<Notifier['connect']>(() => (): void => undefined),
  };
}
