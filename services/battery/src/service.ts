import { fileURLToPath } from 'node:url';
import { createService, type Service, type ServiceOptions } from '@yoman/service-kit';
import type { Route } from '@yoman/service-kit/route';
import { createPgStore } from './adapters/pg-store.js';
import { BatteryConfig } from './config.js';
import { batteryRoutes } from './routes/battery.js';
import type { RouteDeps } from './routes/route-deps.js';
import { sampleRoutes } from './routes/samples.js';

/** Next to `src/` and `dist/`, so the same path works from source and from the build. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildRoutes(deps: RouteDeps): Route[] {
  return [...sampleRoutes(deps), ...batteryRoutes(deps)];
}

/** The runtime knobs tests and `main` may set; name, migrations and routes are fixed. */
export type BatteryServiceOptions = Pick<
  ServiceOptions<typeof BatteryConfig>,
  'env' | 'logStream' | 'handleSignals'
>;

export function createBatteryService(options: BatteryServiceOptions = {}): Service<BatteryConfig> {
  return createService({
    name: 'battery',
    migrationsDir: MIGRATIONS_DIR,
    config: BatteryConfig,
    ...options,
    routes: ({ db, config }) =>
      buildRoutes({
        store: createPgStore(db),
        now: () => new Date(),
        timeZone: config.service.TZ,
      }),
  });
}
