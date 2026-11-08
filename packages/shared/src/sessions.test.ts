import { describe, expect, it } from 'vitest';
import { LIMITS } from './limits.js';
import { App, AppList, AppUpdate, Rule, RuleInput, RuleList, Session } from './sessions.js';

const id = '0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e';
const app = { id: 'firefox', name: 'Firefox', icon: 'firefox', category: 'browsing' };
const rule = {
  field: 'wmClass',
  match: 'prefix',
  pattern: 'org.gnome.',
  category: 'system',
  priority: 10,
};
const session = {
  id,
  appId: 'firefox',
  start: '2026-11-08T10:00:00Z',
  end: '2026-11-08T10:05:00Z',
};

describe('apps', () => {
  it('accepts an app, a list and an update', () => {
    expect(App.safeParse(app).success).toBe(true);
    expect(AppList.safeParse({ items: [app] }).success).toBe(true);
    expect(AppUpdate.safeParse({ name: 'Browser', category: null }).success).toBe(true);
  });

  it('rejects icon paths, bad categories and renaming the id', () => {
    expect(App.safeParse({ ...app, icon: '/usr/share/icons/x.png' }).success).toBe(false);
    expect(App.safeParse({ ...app, category: 'Not A Slug' }).success).toBe(false);
    expect(AppUpdate.safeParse({ name: 'x', category: null, id: 'y' }).success).toBe(false);
  });
});

describe('Session', () => {
  it('accepts a session with or without a title', () => {
    expect(Session.safeParse(session).success).toBe(true);
    expect(Session.safeParse({ ...session, title: 'Inbox' }).success).toBe(true);
  });

  it('rejects a session that ends before it starts', () => {
    expect(Session.safeParse({ ...session, end: '2026-11-08T09:00:00Z' }).success).toBe(false);
  });
});

describe('rules', () => {
  it('accepts a rule input, a rule and a list', () => {
    expect(RuleInput.safeParse(rule).success).toBe(true);
    expect(Rule.safeParse({ id, ...rule }).success).toBe(true);
    expect(RuleList.safeParse({ items: [{ id, ...rule }] }).success).toBe(true);
  });

  it('rejects regex matching, empty or huge patterns and out-of-range priority', () => {
    expect(RuleInput.safeParse({ ...rule, match: 'regex' }).success).toBe(false);
    expect(RuleInput.safeParse({ ...rule, pattern: '' }).success).toBe(false);
    expect(
      RuleInput.safeParse({ ...rule, pattern: 'x'.repeat(LIMITS.patternLength + 1) }).success,
    ).toBe(false);
    expect(RuleInput.safeParse({ ...rule, priority: 1001 }).success).toBe(false);
    expect(RuleInput.safeParse({ ...rule, field: 'cmdline' }).success).toBe(false);
  });
});
