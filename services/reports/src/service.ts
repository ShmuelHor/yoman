import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';

import { createPgStore } from './adapters/pg-store.js';
import { ReportsConfig } from './config.js';
import { reportRoutes } from './routes/reports.js';
import type { RouteDeps } from './routes/route-deps.js';
import { sessionRoutes } from './routes/sessions.js';

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [...sessionRoutes(deps), ...reportRoutes(deps)];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type ReportsServiceOptions = Pick<
  ServiceOptions<typeof ReportsConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createReportsService(options: ReportsServiceOptions = {}): Service<ReportsConfig> {
  return createService({
    name: 'reports',
    migrationsDir: MIGRATIONS_DIR,
    config: ReportsConfig,
    ...options,
    routes: ({ db, config }) =>
      buildRoutes({
        store: createPgStore(db),
        now: () => new Date(),
        timeZone: config.service.TZ,
      }),
  });
}
