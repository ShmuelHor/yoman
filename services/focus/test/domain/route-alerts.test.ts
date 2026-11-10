import type { Alert, AlertLevel, AlertType } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';

import {
  decide,
  effectiveLevel,
  isRateLimited,
  RATE_LIMIT_MS,
  routeAlerts,
} from '../../src/domain/route-alerts.js';

const NOW_MS = Date.parse('2026-11-08T10:00:00.000Z');
const NO_POLICY = new Map<AlertType, AlertLevel>();
const NOTHING_SENT = new Map<string, number>();

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    alertKey: 'battery-low:15',
    type: 'battery-low',
    level: 'important',
    ts: '2026-11-08T09:59:00.000Z',
    params: { percent: 14 },
    ...overrides,
  };
}

describe('decide', () => {
  it.each([
    ['critical', true, 'deliver'],
    ['important', true, 'queue'],
    ['normal', true, 'queue'],
    ['critical', false, 'deliver'],
    ['important', false, 'deliver'],
    ['normal', false, 'deliver'],
  ] as const)('a %s alert with inFocus=%s is routed to %s', (level, inFocus, expected) => {
    expect(decide(level, inFocus)).toBe(expected);
  });
});

describe('effectiveLevel', () => {
  it("uses the policy's level for the alert type over the sender's level", () => {
    const policy = new Map<AlertType, AlertLevel>([['battery-low', 'critical']]);

    expect(effectiveLevel(alert(), policy)).toBe('critical');
  });

  it("keeps the sender's level when the policy has no entry for the type", () => {
    const policy = new Map<AlertType, AlertLevel>([['thermal', 'normal']]);

    expect(effectiveLevel(alert(), policy)).toBe('important');
  });
});

describe('isRateLimited', () => {
  it('limits a key let through less than 10 min ago and frees it at exactly 10 min', () => {
    expect(isRateLimited(undefined, NOW_MS)).toBe(false);
    expect(isRateLimited(NOW_MS - RATE_LIMIT_MS + 1, NOW_MS)).toBe(true);
    expect(isRateLimited(NOW_MS - RATE_LIMIT_MS, NOW_MS)).toBe(false);
  });
});

describe('routeAlerts', () => {
  const levels: AlertLevel[] = ['critical', 'important', 'normal'];

  it('queues everything but critical during focus', () => {
    const alerts = levels.map((level) => alert({ alertKey: `k-${level}`, level }));

    const outcome = routeAlerts({
      alerts,
      policy: NO_POLICY,
      inFocus: true,
      lastAccepted: NOTHING_SENT,
      nowMs: NOW_MS,
    });

    expect(outcome.deliver.map((a) => a.level)).toEqual(['critical']);
    expect(outcome.queue.map((a) => a.level)).toEqual(['important', 'normal']);
  });

  it('delivers every level outside focus', () => {
    const alerts = levels.map((level) => alert({ alertKey: `k-${level}`, level }));

    const outcome = routeAlerts({
      alerts,
      policy: NO_POLICY,
      inFocus: false,
      lastAccepted: NOTHING_SENT,
      nowMs: NOW_MS,
    });

    expect(outcome.deliver.map((a) => a.level)).toEqual(levels);
    expect(outcome.queue).toEqual([]);
  });

  it('routes by the policy level and passes that level on to the notifier', () => {
    const policy = new Map<AlertType, AlertLevel>([['battery-low', 'critical']]);

    const outcome = routeAlerts({
      alerts: [alert()],
      policy,
      inFocus: true,
      lastAccepted: NOTHING_SENT,
      nowMs: NOW_MS,
    });

    expect(outcome.deliver).toEqual([alert({ level: 'critical' })]);
  });

  it('drops an alert whose key was let through in the last 10 min, even a critical one', () => {
    const outcome = routeAlerts({
      alerts: [alert({ level: 'critical' })],
      policy: NO_POLICY,
      inFocus: false,
      lastAccepted: new Map([['battery-low:15', NOW_MS - RATE_LIMIT_MS + 1]]),
      nowMs: NOW_MS,
    });

    expect(outcome).toEqual({ deliver: [], queue: [], limited: 1, acceptedKeys: [] });
  });

  it('counts a queued alert against the rate limit, so a repeat in the same batch is dropped', () => {
    const outcome = routeAlerts({
      alerts: [alert(), alert({ ts: '2026-11-08T09:59:30.000Z' }), alert({ alertKey: 'other' })],
      policy: NO_POLICY,
      inFocus: true,
      lastAccepted: NOTHING_SENT,
      nowMs: NOW_MS,
    });

    expect(outcome.queue.map((a) => a.alertKey)).toEqual(['battery-low:15', 'other']);
    expect(outcome.limited).toBe(1);
    expect(outcome.acceptedKeys).toEqual(['battery-low:15', 'other']);
  });

  it('lets a key through again once its window has passed', () => {
    const outcome = routeAlerts({
      alerts: [alert()],
      policy: NO_POLICY,
      inFocus: false,
      lastAccepted: new Map([['battery-low:15', NOW_MS - RATE_LIMIT_MS]]),
      nowMs: NOW_MS,
    });

    expect(outcome.deliver).toHaveLength(1);
    expect(outcome.acceptedKeys).toEqual(['battery-low:15']);
  });
});
