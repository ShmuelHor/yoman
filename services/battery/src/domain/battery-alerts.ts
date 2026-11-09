import type { Alert, AlertLevel, AlertType } from '@yoman/shared/alerts';
import type { BatteryStatus } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';

const LOW_BELOW_PCT = 15;
const CRITICAL_BELOW_PCT = 8;
const MS_PER_HOUR = 3_600_000;
const PLUGGED_FULL_HOURS = 4;
/** Plugged in at 100% for longer than this raises `battery-plugged-full` (SPEC §5 battery). */
export const PLUGGED_FULL_MS = PLUGGED_FULL_HOURS * MS_PER_HOUR;

/** How far a discharging battery has fallen. Ordered: each step is worse. */
export const DRAIN_LEVELS = ['none', 'low', 'critical'] as const;
export type DrainLevel = (typeof DRAIN_LEVELS)[number];

type BatteryAlertType = Extract<AlertType, `battery-${string}`>;

/** The alert levels SPEC §5 battery assigns; focus's `alert_policy` may override them. */
const LEVELS: Readonly<Record<BatteryAlertType, AlertLevel>> = {
  'battery-low': 'important',
  'battery-critical': 'critical',
  'battery-plugged-full': 'normal',
};

/**
 * What the alert rules remember between batches, so each alert fires once when
 * its condition starts instead of on every sample while it lasts.
 */
export interface AlertState {
  /** The newest sample applied; older ones arrive late and change nothing. */
  readonly lastTsMs: number | null;
  readonly drain: DrainLevel;
  /** When the current run of plugged-in-at-100% samples began. */
  readonly fullSinceMs: number | null;
  /** Whether that run already raised its alert. */
  readonly fullAlerted: boolean;
}

export const INITIAL_ALERT_STATE: AlertState = {
  lastTsMs: null,
  drain: 'none',
  fullSinceMs: null,
  fullAlerted: false,
};

export interface AlertReading {
  /** As sent, so the alert carries the sample's own timestamp. */
  readonly ts: string;
  readonly tsMs: number;
  readonly capacityPct: number;
  readonly status: BatteryStatus;
}

export interface AlertOutcome {
  readonly state: AlertState;
  readonly alerts: Alert[];
}

function drainOf(reading: AlertReading): DrainLevel {
  if (reading.status !== 'discharging') {
    return 'none';
  }
  if (reading.capacityPct < CRITICAL_BELOW_PCT) {
    return 'critical';
  }
  return reading.capacityPct < LOW_BELOW_PCT ? 'low' : 'none';
}

/** On the charger and full. Some batteries stop at 100% as `not-charging` or `unknown`. */
function isPluggedFull(reading: AlertReading): boolean {
  return (
    reading.status !== 'discharging' &&
    (reading.status === 'full' || reading.capacityPct >= LIMITS.percent)
  );
}

/** The type is the key, so focus's rate limit also damps a charger plugged in and out. */
function alert(type: BatteryAlertType, reading: AlertReading, params: Alert['params']): Alert {
  return { alertKey: type, type, level: LEVELS[type], ts: reading.ts, params };
}

function step(state: AlertState, reading: AlertReading): AlertOutcome {
  const alerts: Alert[] = [];
  const drain = drainOf(reading);
  if (DRAIN_LEVELS.indexOf(drain) > DRAIN_LEVELS.indexOf(state.drain)) {
    const type = drain === 'critical' ? 'battery-critical' : 'battery-low';
    alerts.push(alert(type, reading, { percent: Math.round(reading.capacityPct) }));
  }

  const plugged = isPluggedFull(reading);
  const fullSinceMs = plugged ? (state.fullSinceMs ?? reading.tsMs) : null;
  const pluggedMs = fullSinceMs === null ? 0 : reading.tsMs - fullSinceMs;
  let fullAlerted = plugged && state.fullAlerted;
  if (!fullAlerted && pluggedMs > PLUGGED_FULL_MS) {
    fullAlerted = true;
    alerts.push(
      alert('battery-plugged-full', reading, { hours: Math.floor(pluggedMs / MS_PER_HOUR) }),
    );
  }

  return { state: { lastTsMs: reading.tsMs, drain, fullSinceMs, fullAlerted }, alerts };
}

/** Within one batch only the newest alert of a type counts, and critical supersedes low. */
function collapse(alerts: readonly Alert[]): Alert[] {
  const byType = new Map(alerts.map((a) => [a.type, a]));
  if (byType.has('battery-critical')) {
    byType.delete('battery-low');
  }
  return [...byType.values()];
}

/**
 * Applies new samples to the battery alert rules (SPEC §5 battery): below 15%
 * while discharging is `important`, below 8% is `critical`, and plugged in at
 * 100% for more than 4 hours is `normal`. Each fires when its condition starts:
 * a drain alert again only after the level eased (usually on the charger), the
 * plugged one after unplugging.
 * Samples at or before the state's newest are already applied and skipped, so
 * a retried batch raises nothing twice.
 */
export function advanceAlerts(state: AlertState, readings: readonly AlertReading[]): AlertOutcome {
  const fresh = [...readings]
    .filter((reading) => state.lastTsMs === null || reading.tsMs > state.lastTsMs)
    .sort((a, b) => a.tsMs - b.tsMs);
  let current = state;
  const alerts: Alert[] = [];
  for (const reading of fresh) {
    if (current.lastTsMs !== null && reading.tsMs <= current.lastTsMs) {
      continue;
    }
    const outcome = step(current, reading);
    current = outcome.state;
    alerts.push(...outcome.alerts);
  }
  return { state: current, alerts: collapse(alerts) };
}
