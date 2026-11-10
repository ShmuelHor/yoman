import { describe, expect, it } from 'vitest';
import {
  parseActionInvoked,
  parseNotificationClosed,
  parseNotifyReply,
} from '../../../../src/actuators/notifier/domain/signals.js';

const ID = 42;
const DISMISSED_BY_USER = 2;
const TOO_BIG_ID = 4_294_967_296;
const MAX_ACTION_KEY_LENGTH = 64;
const TOO_LONG_ACTION = 'x'.repeat(MAX_ACTION_KEY_LENGTH + 1);

describe('parseNotifyReply', () => {
  it('reads the notification id', () => {
    expect(parseNotifyReply([ID])).toBe(ID);
  });

  it.each([[[]], [[0]], [[String(ID)]], [[-ID]], [[TOO_BIG_ID]], [[ID, ID]]])(
    'rejects %j',
    (body) => {
      expect(parseNotifyReply(body)).toBeUndefined();
    },
  );
});

describe('parseActionInvoked', () => {
  it('reads the id and the action key', () => {
    expect(parseActionInvoked([ID, 'open-dashboard'])).toEqual({
      id: ID,
      action: 'open-dashboard',
    });
  });

  it.each([[[ID]], [[String(ID), 'default']], [[ID, TOO_LONG_ACTION]], [[0, 'default']]])(
    'rejects %j',
    (body) => {
      expect(parseActionInvoked(body)).toBeUndefined();
    },
  );
});

describe('parseNotificationClosed', () => {
  it('reads the closed id', () => {
    expect(parseNotificationClosed([ID, DISMISSED_BY_USER])).toBe(ID);
  });

  it.each([[[ID]], [[ID, 'dismissed']], [[0, DISMISSED_BY_USER]]])('rejects %j', (body) => {
    expect(parseNotificationClosed(body)).toBeUndefined();
  });
});
