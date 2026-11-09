import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';
import type { z } from 'zod';

import { createPgStore } from './adapters/pg-store.js';
import { appRoutes } from './routes/apps.js';
import type { RouteDeps } from './routes/route-deps.js';
import { ruleRoutes } from './routes/rules.js';
import { sampleRoutes } from './routes/samples.js';
import { sessionRoutes } from './routes/sessions.js';

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
/** The service reads no variables of its own beyond the shared ones. */
type NoConfig = z.ZodObject<Record<never, never>>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [...sampleRoutes(deps), ...sessionRoutes(deps), ...appRoutes(deps), ...ruleRoutes(deps)];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type SessionsServiceOptions = Pick<
  ServiceOptions<NoConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createSessionsService(
  options: SessionsServiceOptions = {},
): Service<z.output<NoConfig>> {
  return createService({
    name: 'sessions',
    migrationsDir: MIGRATIONS_DIR,
    ...options,
    routes: ({ db }) => buildRoutes({ store: createPgStore(db), now: () => new Date() }),
  });
}
