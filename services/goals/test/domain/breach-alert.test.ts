import { Alert } from '@yoman/shared/alerts';
import type { Goal } from '@yoman/shared/goals';
import { notificationMessages } from '@yoman/shared/notifications';
import { describe, expect, it } from 'vitest';

import { breachAlert } from '../../src/domain/breach-alert.js';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const DATE = '2026-11-08';
const USED = 45;
const TARGET = 30;

const goal: Goal = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'max',
  target: { kind: 'app', appId: 'org.telegram.desktop' },
  minutes: TARGET,
  days: [0],
};

describe('breachAlert', () => {
  it('builds a goal-breach alert that validates against the shared contract', () => {
    const alert = breachAlert({ goal, date: DATE, minutesUsed: USED }, NOW);

    expect(Alert.parse(alert)).toEqual({
      alertKey: `goal-breach:${goal.id}:${DATE}`,
      type: 'goal-breach',
      level: 'normal',
      ts: NOW.toISOString(),
      params: { target: 'org.telegram.desktop', minutesUsed: USED, targetMinutes: TARGET },
    });
  });

  it('sends every param the notification message interpolates', () => {
    const target = { kind: 'category', category: 'social' } as const;

    const alert = breachAlert({ goal: { ...goal, target }, date: DATE, minutesUsed: USED }, NOW);

    expect(Object.keys(alert.params).sort()).toEqual(
      [...notificationMessages['goal-breach'].params].sort(),
    );
    expect(alert.params).toMatchObject({ target: 'social' });
  });
});
