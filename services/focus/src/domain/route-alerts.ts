import type { Alert, AlertLevel, AlertType } from '@yoman/shared/alerts';

const MS_PER_MINUTE = 60_000;
const RATE_LIMIT_MINUTES = 10;

/** At most one alert per `alertKey` in this window (SPEC §5 focus). */
export const RATE_LIMIT_MS = RATE_LIMIT_MINUTES * MS_PER_MINUTE;

export type Decision = 'deliver' | 'queue';

/**
 * SPEC §5 focus levels: `critical` always gets through; `important` and
 * `normal` get through only outside focus, and are queued during it.
 */
export function decide(level: AlertLevel, inFocus: boolean): Decision {
  if (!inFocus || level === 'critical') {
    return 'deliver';
  }
  return 'queue';
}

/** The user's `alert_policy` decides an alert type's level; without an entry, the sender's does. */
export function effectiveLevel(
  alert: Alert,
  policy: ReadonlyMap<AlertType, AlertLevel>,
): AlertLevel {
  return policy.get(alert.type) ?? alert.level;
}

/** True when an alert with this key was let through (delivered or queued) less than 10 min ago. */
export function isRateLimited(lastAcceptedMs: number | undefined, nowMs: number): boolean {
  return lastAcceptedMs !== undefined && nowMs - lastAcceptedMs < RATE_LIMIT_MS;
}

export interface RoutingInput {
  readonly alerts: readonly Alert[];
  readonly policy: ReadonlyMap<AlertType, AlertLevel>;
  readonly inFocus: boolean;
  /** When each key was last let through, for the keys in `alerts`. */
  readonly lastAccepted: ReadonlyMap<string, number>;
  readonly nowMs: number;
}

export interface RoutingOutcome {
  readonly deliver: Alert[];
  readonly queue: Alert[];
  /** Alerts dropped by the rate limit. */
  readonly limited: number;
  /** The keys let through now, which restart their rate-limit window. */
  readonly acceptedKeys: string[];
}

/**
 * Decides every alert of a batch, in order. An alert carries its effective
 * level onward, so the notifier's urgency matches the decision. A second
 * alert with the same key in one batch falls inside the first one's window.
 */
export function routeAlerts(input: RoutingInput): RoutingOutcome {
  const lastAccepted = new Map(input.lastAccepted);
  const decided: Record<Decision, Alert[]> = { deliver: [], queue: [] };
  const acceptedKeys: string[] = [];
  let limited = 0;
  for (const alert of input.alerts) {
    if (isRateLimited(lastAccepted.get(alert.alertKey), input.nowMs)) {
      limited += 1;
      continue;
    }
    lastAccepted.set(alert.alertKey, input.nowMs);
    acceptedKeys.push(alert.alertKey);
    const level = effectiveLevel(alert, input.policy);
    decided[decide(level, input.inFocus)].push({ ...alert, level });
  }
  return { deliver: decided.deliver, queue: decided.queue, limited, acceptedKeys };
}
