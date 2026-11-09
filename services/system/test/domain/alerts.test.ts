import { Alert } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';

import { incidentAlert, uniqueAlerts } from '../../src/domain/alerts.js';
import type { IncidentState } from '../../src/domain/incident.js';

const OPENED = Date.parse('2026-11-08T09:00:20.000Z');
const SUSTAINED_MS = 20_000;
const MINUTE_MS = 60_000;
const WORSE_PEAK = 70;
const culprit = { pid: 42, comm: 'node', container: null, cpuPct: 97, rssBytes: 1_000 };

function incident(overrides: Partial<IncidentState>): IncidentState {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'cpu',
    startMs: OPENED - SUSTAINED_MS,
    endMs: null,
    peak: 55,
    culprits: [culprit],
    pid: null,
    ...overrides,
  };
}

describe('incidentAlert', () => {
  it('raises a normal pressure alert, keyed by the resource, valid against the contract', () => {
    const alert = incidentAlert(incident({}), OPENED);

    expect(Alert.parse(alert)).toEqual({
      alertKey: 'system:cpu',
      type: 'pressure-incident',
      level: 'normal',
      ts: '2026-11-08T09:00:20.000Z',
      params: { resource: 'cpu', peak: 55, comm: 'node', pid: 42 },
    });
  });

  it('raises a critical alert near OOM', () => {
    const alert = incidentAlert(incident({ type: 'memory-critical', culprits: [] }), OPENED);

    expect(alert).toMatchObject({ type: 'memory-critical', level: 'critical' });
    expect(alert.params).toEqual({ resource: 'memory-critical', peak: 55 });
  });

  it('raises an important alert for overheating, with the temperature', () => {
    const alert = incidentAlert(incident({ type: 'thermal', peak: 97 }), OPENED);

    expect(alert).toMatchObject({ type: 'thermal', level: 'important', params: { celsius: 97 } });
  });

  it('raises an important alert for a leak, keyed by its process', () => {
    const alert = incidentAlert(incident({ type: 'memory-leak', pid: 42, peak: 2e9 }), OPENED);

    expect(Alert.parse(alert)).toMatchObject({
      alertKey: 'system:memory-leak:42',
      type: 'memory-leak',
      level: 'important',
      params: { comm: 'node', pid: 42, bytesPerHour: 2e9 },
    });
  });
});

describe('uniqueAlerts', () => {
  it('keeps the first alert of each key', () => {
    const first = incidentAlert(incident({}), OPENED);
    const again = incidentAlert(incident({ peak: WORSE_PEAK }), OPENED + MINUTE_MS);
    const other = incidentAlert(incident({ type: 'io' }), OPENED);

    expect(uniqueAlerts([first, again, other])).toEqual([first, other]);
  });
});
