import { Writable } from 'node:stream';
import { createService, type Service } from '@yoman/service-kit';

import { buildRoutes } from '../src/service.js';
import { createMemoryStore, type MemoryStore } from './memory-store.js';

export const NOW = new Date('2026-11-08T10:00:00.000Z');

/** Never connected to: the routes run on the memory store. Port 1 refuses at once. */
const ENV = { SYSTEM_DB_PASSWORD: 'not-a-real-secret', DB_HOST: '127.0.0.1', DB_PORT: '1' };

const discard = new Writable({
  write(_chunk, _encoding, done): void {
    done();
  },
});

export interface TestService {
  readonly service: Service<Record<never, never>>;
  readonly store: MemoryStore;
}

/** The real routes and error handling over an in-memory store, a fixed clock and a zone. */
export function createTestService(
  store: MemoryStore = createMemoryStore(),
  timeZone = 'UTC',
): TestService {
  const service = createService({
    name: 'system',
    migrationsDir: '/nonexistent',
    env: ENV,
    logStream: discard,
    handleSignals: false,
    routes: buildRoutes({ store, now: () => NOW, timeZone }),
  });
  return { service, store };
}
