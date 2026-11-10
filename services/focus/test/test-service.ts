import { Writable } from 'node:stream';
import { createService, type Service } from '@yoman/service-kit';

import { buildRoutes } from '../src/service.js';
import { createMemoryStore, type MemoryStore } from './memory-store.js';

/** Sunday 2026-11-08, 12:00 in Jerusalem. */
export const NOW = new Date('2026-11-08T10:00:00.000Z');
export const TIME_ZONE = 'Asia/Jerusalem';

/** Never connected to: the routes run on the memory store. Port 1 refuses at once. */
const ENV = { FOCUS_DB_PASSWORD: 'not-a-real-secret', DB_HOST: '127.0.0.1', DB_PORT: '1' };

const discard = new Writable({
  write(_chunk, _encoding, done): void {
    done();
  },
});

export interface TestService {
  readonly service: Service<Record<never, never>>;
  readonly store: MemoryStore;
  /** Moves the service's clock, which starts at {@link NOW}. */
  readonly setNow: (now: Date) => void;
}

/** The real routes and error handling over an in-memory store, a settable clock and a fixed zone. */
export function createTestService(store: MemoryStore = createMemoryStore()): TestService {
  let now = NOW;
  const service = createService({
    name: 'focus',
    migrationsDir: '/nonexistent',
    env: ENV,
    logStream: discard,
    handleSignals: false,
    routes: buildRoutes({ store, now: () => now, timeZone: TIME_ZONE }),
  });
  return {
    service,
    store,
    setNow: (next): void => {
      now = next;
    },
  };
}
