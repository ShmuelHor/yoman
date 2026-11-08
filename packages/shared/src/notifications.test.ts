import { describe, expect, it } from 'vitest';
import { AlertType } from './alerts.js';
import { alertFixture } from './fixtures/data.js';
import { notificationKeys, notificationMessages } from './notifications.js';

describe('notification messages', () => {
  it('has a message for every alert type', () => {
    expect(Object.keys(notificationMessages).sort()).toEqual([...AlertType.options].sort());
  });

  it('uses unique, well-formed keys', () => {
    expect(new Set(notificationKeys).size).toBe(notificationKeys.length);
    for (const key of notificationKeys) {
      expect(key).toMatch(/^notifications\.[a-z][a-zA-Z]*\.(title|body)$/);
    }
  });

  it('names params that Alert.params accepts', () => {
    for (const { params } of Object.values(notificationMessages)) {
      for (const param of params) {
        expect(param).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/);
      }
    }
  });

  it('matches the params of the alert fixture', () => {
    expect(Object.keys(alertFixture.params)).toEqual([
      ...notificationMessages[alertFixture.type].params,
    ]);
  });
});
