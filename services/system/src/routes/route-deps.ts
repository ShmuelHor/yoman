import type { SystemStore } from '../use-cases/store.js';

/** What every route module needs. Passed in, so tests can swap the store, the clock and the zone. */
export interface RouteDeps {
  readonly store: SystemStore;
  readonly now: () => Date;
  /** The IANA zone the timeline's local days are counted in. */
  readonly timeZone: string;
}
