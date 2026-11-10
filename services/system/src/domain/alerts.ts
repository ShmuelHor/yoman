import type { Alert, AlertLevel, AlertParams, AlertType } from '@yoman/shared/alerts';
import type { IncidentType } from '@yoman/shared/system';

import type { IncidentState } from './incident.js';

interface AlertKind {
  readonly type: AlertType;
  /**
   * SPEC §5 system sets near-OOM to critical and overheating to important. It
   * gives no level for pressure or leaks: pressure passes on its own, so it
   * waits for focus to end; a leak is heading for OOM, so it is important.
   */
  readonly level: AlertLevel;
}

const ALERT_KINDS: Readonly<Record<IncidentType, AlertKind>> = {
  cpu: { type: 'pressure-incident', level: 'normal' },
  memory: { type: 'pressure-incident', level: 'normal' },
  io: { type: 'pressure-incident', level: 'normal' },
  'memory-critical': { type: 'memory-critical', level: 'critical' },
  thermal: { type: 'thermal', level: 'important' },
  'memory-leak': { type: 'memory-leak', level: 'important' },
};

/**
 * One key per condition, not per incident, so focus's rate limit (one alert
 * per key per 10 min) also holds back an incident that keeps reopening. A
 * leak is keyed by its process.
 */
function alertKey(incident: IncidentState): string {
  return incident.pid === null
    ? `system:${incident.type}`
    : `system:${incident.type}:${incident.pid}`;
}

function alertParams(incident: IncidentState): AlertParams {
  const [culprit] = incident.culprits;
  const top = culprit === undefined ? {} : { comm: culprit.comm, pid: culprit.pid };
  if (incident.type === 'memory-leak') {
    return { ...top, bytesPerHour: incident.peak };
  }
  if (incident.type === 'thermal') {
    return { celsius: incident.peak };
  }
  return { resource: incident.type, peak: incident.peak, ...top };
}

/** The alert for an incident that just opened, at the moment it opened. */
export function incidentAlert(incident: IncidentState, openedAtMs: number): Alert {
  const kind = ALERT_KINDS[incident.type];
  return {
    alertKey: alertKey(incident),
    type: kind.type,
    level: kind.level,
    ts: new Date(openedAtMs).toISOString(),
    params: alertParams(incident),
  };
}

/** One alert per key: the first. Focus would drop the rest within 10 min anyway. */
export function uniqueAlerts(alerts: readonly Alert[]): Alert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.alertKey)) {
      return false;
    }
    seen.add(alert.alertKey);
    return true;
  });
}
