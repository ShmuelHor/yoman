import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';
import type { z } from 'zod';

import { createPgStore } from './adapters/pg-store.js';
import { evaluateRoutes } from './routes/evaluate.js';
import { goalRoutes } from './routes/goals.js';
import type { RouteDeps } from './routes/route-deps.js';

/** The service reads no variables of its own beyond the shared ones. */
type NoConfig = z.ZodObject<Record<never, never>>;

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [...goalRoutes(deps), ...evaluateRoutes(deps)];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type GoalsServiceOptions = Pick<
  ServiceOptions<NoConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createGoalsService(options: GoalsServiceOptions = {}): Service<z.output<NoConfig>> {
  return createService({
    name: 'goals',
    migrationsDir: MIGRATIONS_DIR,
    ...options,
    routes: ({ db }) => buildRoutes({ store: createPgStore(db), now: () => new Date() }),
  });
}
