import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';

import { createPgStore } from './adapters/pg-store.js';
import { FocusConfig } from './config.js';
import { alertRoutes } from './routes/alerts.js';
import { focusRoutes } from './routes/focus.js';
import { knownAppRoutes } from './routes/known-apps.js';
import { profileRoutes } from './routes/profiles.js';
import type { RouteDeps } from './routes/route-deps.js';
import { scheduleRoutes } from './routes/schedules.js';

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [
    ...focusRoutes(deps),
    ...alertRoutes(deps),
    ...profileRoutes(deps),
    ...knownAppRoutes(deps),
    ...scheduleRoutes(deps),
  ];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type FocusServiceOptions = Pick<
  ServiceOptions<typeof FocusConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createFocusService(options: FocusServiceOptions = {}): Service<FocusConfig> {
  return createService({
    name: 'focus',
    migrationsDir: MIGRATIONS_DIR,
    config: FocusConfig,
    ...options,
    routes: ({ db, config }) =>
      buildRoutes({
        store: createPgStore(db),
        now: () => new Date(),
        timeZone: config.service.TZ,
      }),
  });
}
