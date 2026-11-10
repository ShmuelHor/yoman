import type { Culprit, IncidentType } from '@yoman/shared/system';

/**
 * An incident as the service tracks it. `id` is `null` until it is stored; an
 * incident with an `id` is a stored one, extended or closed.
 */
export interface IncidentState {
  readonly id: string | null;
  readonly type: IncidentType;
  readonly startMs: number;
  /** `null` while the incident is open. */
  readonly endMs: number | null;
  /** The peak `avg10` for pressure, °C for thermal, bytes per hour for a leak. */
  readonly peak: number;
  readonly culprits: readonly Culprit[];
  /** The leaking process of a `memory-leak` incident; `null` for every other type. */
  readonly pid: number | null;
}

/** An incident a batch opened, changed or closed. */
export interface IncidentChange {
  readonly incident: IncidentState;
  /** When the incident was opened by this batch, for its alert; `null` if it was already open. */
  readonly openedAtMs: number | null;
}
