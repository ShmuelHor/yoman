import { describe, expect, it } from 'vitest';
import { Alert, AlertParams, QueuedAlert } from '../src/alerts.js';
import { LIMITS } from '../src/limits.js';

const alert = {
  alertKey: 'battery:low',
  type: 'battery-low',
  level: 'important',
  ts: '2026-11-08T10:00:00Z',
  params: { percent: 14 },
} as const;

describe('Alert', () => {
  it('accepts a valid alert and queued alert', () => {
    expect(Alert.safeParse(alert).success).toBe(true);
    expect(QueuedAlert.safeParse({ alert, queuedAt: '2026-11-08T10:00:01Z' }).success).toBe(true);
  });

  it('rejects unknown types, levels and extra keys', () => {
    expect(Alert.safeParse({ ...alert, type: 'battery-empty' }).success).toBe(false);
    expect(Alert.safeParse({ ...alert, level: 'urgent' }).success).toBe(false);
    expect(Alert.safeParse({ ...alert, title: 'x' }).success).toBe(false);
    expect(Alert.safeParse({ ...alert, alertKey: 'a b' }).success).toBe(false);
  });
});

describe('AlertParams', () => {
  it('rejects too many, oversized or badly named params', () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, i]));
    expect(AlertParams.safeParse(many).success).toBe(false);
    expect(AlertParams.safeParse({ name: 'x'.repeat(LIMITS.paramValueLength + 1) }).success).toBe(
      false,
    );
    expect(AlertParams.safeParse({ __proto__x: 1 }).success).toBe(false);
    expect(AlertParams.safeParse({ ok: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});
