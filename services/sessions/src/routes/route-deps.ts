import type { SessionsStore } from '../use-cases/store.js';

/** What every route module needs. Passed in, so tests can swap the store and the clock. */
export interface RouteDeps {
  readonly store: SessionsStore;
  readonly now: () => Date;
}
