import { describe, expect, it } from 'vitest';
import { NotifyRequest } from '../../../../src/actuators/notifier/domain/notify-request.js';

const ALERT = {
  alertKey: 'battery:low',
  type: 'battery-low',
  level: 'important',
  ts: '2026-11-10T08:00:00.000Z',
  params: { percent: 14 },
};

describe('NotifyRequest', () => {
  it('accepts an alert with or without a language', () => {
    expect(NotifyRequest.safeParse({ alert: ALERT, language: 'en' }).success).toBe(true);
    expect(NotifyRequest.safeParse({ alert: ALERT }).success).toBe(true);
  });

  it('rejects an unknown language', () => {
    expect(NotifyRequest.safeParse({ alert: ALERT, language: 'fr' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(NotifyRequest.safeParse({ alert: ALERT, html: '<b>' }).success).toBe(false);
  });

  it('rejects an alert of an unknown type', () => {
    expect(NotifyRequest.safeParse({ alert: { ...ALERT, type: 'custom' } }).success).toBe(false);
  });
});
