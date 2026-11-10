import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';
import type { z } from 'zod';

import { createPgStore } from './adapters/pg-store.js';
import { SystemConfig } from './config.js';
import { culpritRoutes } from './routes/culprits.js';
import { incidentRoutes } from './routes/incidents.js';
import type { RouteDeps } from './routes/route-deps.js';
import { sampleRoutes } from './routes/samples.js';
import { timelineRoutes } from './routes/timeline.js';

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [
    ...sampleRoutes(deps),
    ...incidentRoutes(deps),
    ...culpritRoutes(deps),
    ...timelineRoutes(deps),
  ];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type SystemServiceOptions = Pick<
  ServiceOptions<typeof SystemConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createSystemService(
  options: SystemServiceOptions = {},
): Service<z.output<typeof SystemConfig>> {
  return createService({
    name: 'system',
    migrationsDir: MIGRATIONS_DIR,
    config: SystemConfig,
    ...options,
    routes: ({ db, config }) =>
      buildRoutes({ store: createPgStore(db), now: () => new Date(), timeZone: config.service.TZ }),
  });
}
