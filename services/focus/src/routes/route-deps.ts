import type { FocusStore } from '../use-cases/store.js';

/** What every route module needs. Passed in, so tests can swap the store and the clock. */
export interface RouteDeps {
  readonly store: FocusStore;
  readonly now: () => Date;
  /** The IANA zone `until HH:MM` is read in. */
  readonly timeZone: string;
}
