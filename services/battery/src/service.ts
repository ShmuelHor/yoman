import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';
import type { z } from 'zod';

import { createPgStore } from './adapters/pg-store.js';
import { batteryRoutes } from './routes/battery.js';
import type { RouteDeps } from './routes/route-deps.js';
import { sampleRoutes } from './routes/samples.js';

/** The service reads no variables of its own beyond the shared ones. */
type NoConfig = z.ZodObject<Record<never, never>>;

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [...sampleRoutes(deps), ...batteryRoutes(deps)];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type BatteryServiceOptions = Pick<
  ServiceOptions<NoConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createBatteryService(
  options: BatteryServiceOptions = {},
): Service<z.output<NoConfig>> {
  return createService({
    name: 'battery',
    migrationsDir: MIGRATIONS_DIR,
    ...options,
    routes: ({ db }) => buildRoutes({ store: createPgStore(db), now: () => new Date() }),
  });
}
