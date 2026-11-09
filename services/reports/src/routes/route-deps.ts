import type { ReportsStore } from '../use-cases/store.js';

/** What every route module needs. Passed in, so tests can swap the store, the clock and the zone. */
export interface RouteDeps {
  readonly store: ReportsStore;
  readonly now: () => Date;
  /** The IANA zone local days are counted in. */
  readonly timeZone: string;
}
