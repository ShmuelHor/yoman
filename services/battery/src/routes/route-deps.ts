import type { BatteryStore } from '../use-cases/store.js';

/** What every route module needs. Passed in, so tests can swap the store and the clock. */
export interface RouteDeps {
  readonly store: BatteryStore;
  readonly now: () => Date;
}
