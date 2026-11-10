import type { Alert } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';
import {
  renderNotification,
  urgencyFor,
} from '../../../../src/actuators/notifier/domain/notification.js';

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    alertKey: 'battery:low',
    type: 'battery-low',
    level: 'important',
    ts: '2026-11-10T08:00:00.000Z',
    params: { percent: 14 },
    ...overrides,
  };
}

describe('urgencyFor', () => {
  it('maps critical to urgency 2, which gets through Do Not Disturb', () => {
    expect(urgencyFor('critical')).toBe(2);
  });

  it.each(['important', 'normal'] as const)('maps %s to urgency 1', (level) => {
    expect(urgencyFor(level)).toBe(1);
  });
});

describe('renderNotification', () => {
  it('translates the title and body into English', () => {
    const { notification, missingParams } = renderNotification({
      alert: alert(),
      language: 'en',
    });

    expect(notification).toEqual({
      appName: 'Yoman',
      summary: 'Battery low',
      body: '14% left. Plug in the charger soon.',
      urgency: 1,
      openDashboardLabel: 'Open dashboard',
    });
    expect(missingParams).toEqual([]);
  });

  it('translates into Hebrew', () => {
    const { notification } = renderNotification({ alert: alert(), language: 'he' });

    expect(notification.body).toContain('14%');
    expect(notification.summary).not.toBe('Battery low');
    expect(notification.appName).not.toBe('Yoman');
  });

  it('gives a critical alert critical urgency', () => {
    const { notification } = renderNotification({
      alert: alert({ type: 'battery-critical', level: 'critical', params: { percent: 7 } }),
      language: 'en',
    });

    expect(notification.urgency).toBe(2);
  });

  it('formats numbers for the language, with at most one decimal', () => {
    const { notification } = renderNotification({
      alert: alert({ type: 'memory-leak', params: { comm: 'node', mbPerHour: 1234.567 } }),
      language: 'en',
    });

    expect(notification.body).toBe('node grows by 1,234.6 MB per hour.');
  });

  it('escapes markup in untrusted values', () => {
    const { notification } = renderNotification({
      alert: alert({ type: 'memory-leak', params: { comm: '<a href=x>', mbPerHour: 5 } }),
      language: 'en',
    });

    expect(notification.body).toBe('&lt;a href=x&gt; grows by 5 MB per hour.');
  });

  it('strips control and bidi characters from untrusted values', () => {
    const { notification } = renderNotification({
      alert: alert({ type: 'memory-leak', params: { comm: '‮gpj.exe\n', mbPerHour: 5 } }),
      language: 'en',
    });

    expect(notification.body).toBe('gpj.exe grows by 5 MB per hour.');
  });

  it('still renders when a param is missing, and reports its name', () => {
    const { notification, missingParams } = renderNotification({
      alert: alert({ params: {} }),
      language: 'en',
    });

    expect(notification.body).toBe('?% left. Plug in the charger soon.');
    expect(missingParams).toEqual(['percent']);
  });

  it('uses the injected translator', () => {
    const { notification } = renderNotification(
      { alert: alert(), language: 'en' },
      (key) => `[${key}]`,
    );

    expect(notification.summary).toBe('[notifications.batteryLow.title]');
    expect(notification.openDashboardLabel).toBe('[notifications.action.openDashboard]');
  });
});
