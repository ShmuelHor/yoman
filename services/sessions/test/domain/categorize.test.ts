import type { Rule } from '@yoman/shared/sessions';
import { describe, expect, it } from 'vitest';

import {
  matchesRule,
  pickRule,
  REAPPLY_WINDOW_DAYS,
  reapplyCutoff,
  recategorize,
  resolveCategory,
} from '../../src/domain/categorize.js';

const LOW = 10;
const HIGH = 50;
const UUID_TAIL_LENGTH = 12;

function rule(id: string, overrides: Partial<Rule> = {}): Rule {
  return {
    id: `00000000-0000-4000-8000-${id.padStart(UUID_TAIL_LENGTH, '0')}`,
    field: 'wmClass',
    match: 'exact',
    pattern: 'code',
    category: 'work',
    priority: LOW,
    ...overrides,
  };
}

const code = { wmClass: 'code', title: 'merge.ts - yoman' };

describe('matchesRule', () => {
  it.each([
    ['exact', 'firefox', 'Firefox', true],
    ['exact', 'firefox', 'firefox-esr', false],
    ['prefix', 'org.gnome.', 'org.gnome.Nautilus', true],
    ['prefix', 'gnome', 'org.gnome.Nautilus', false],
    ['contains', 'chrom', 'google-chrome', true],
    ['contains', 'slack', 'discord', false],
  ] as const)('%s %j against wm_class %j is %s', (match, pattern, wmClass, expected) => {
    const subject = { wmClass, title: null };

    expect(matchesRule(rule('1', { match, pattern }), subject)).toBe(expected);
  });

  it('matches title rules against the title, ignoring case', () => {
    const youtube = rule('1', { field: 'title', match: 'contains', pattern: 'youtube' });

    expect(matchesRule(youtube, { wmClass: 'firefox', title: 'Music - YouTube' })).toBe(true);
  });

  it('never matches a title rule when the session has no title', () => {
    const anything = rule('1', { field: 'title', match: 'contains', pattern: 'a' });

    expect(matchesRule(anything, { wmClass: 'code', title: null })).toBe(false);
  });
});

describe('pickRule', () => {
  it('picks the matching rule with the highest priority', () => {
    const low = rule('1', { category: 'work', priority: LOW });
    const high = rule('2', { field: 'title', match: 'contains', pattern: 'yoman', priority: HIGH });

    expect(pickRule([low, high], code)).toBe(high);
  });

  it('prefers an exact match over a prefix over a contains at equal priority', () => {
    const contains = rule('1', { match: 'contains', pattern: 'od' });
    const prefix = rule('2', { match: 'prefix', pattern: 'co' });
    const exact = rule('3', { match: 'exact', pattern: 'code' });

    expect(pickRule([contains, prefix, exact], code)).toBe(exact);
    expect(pickRule([contains, prefix], code)).toBe(prefix);
  });

  it('breaks a full tie by id, whatever the input order', () => {
    const first = rule('1');
    const second = rule('2');

    expect(pickRule([second, first], code)).toBe(first);
    expect(pickRule([first, second], code)).toBe(first);
  });

  it('ignores rules that do not match, however high their priority', () => {
    const other = rule('1', { pattern: 'firefox', priority: HIGH });

    expect(pickRule([other], code)).toBeUndefined();
  });
});

describe('resolveCategory', () => {
  const rules = [rule('1', { category: 'work' })];

  it('uses the category the user set on the app over any rule', () => {
    expect(resolveCategory(code, rules, 'personal')).toBe('personal');
  });

  it('falls back to the best rule, then to no category', () => {
    expect(resolveCategory(code, rules, null)).toBe('work');
    expect(resolveCategory({ wmClass: 'vlc', title: null }, rules, null)).toBeNull();
  });
});

describe('recategorize', () => {
  it('returns only the sessions whose category changes', () => {
    const rules = [rule('1', { category: 'work' })];
    const sessions = [
      { id: 'a', wmClass: 'code', title: null, category: 'work' },
      { id: 'b', wmClass: 'code', title: null, category: null },
      { id: 'c', wmClass: 'vlc', title: null, category: 'video' },
      { id: 'd', wmClass: 'slack', title: null, category: null },
    ];
    const appCategories = new Map([['slack', 'chat']]);

    expect(recategorize(sessions, rules, appCategories)).toEqual([
      { id: 'b', category: 'work' },
      { id: 'c', category: null },
      { id: 'd', category: 'chat' },
    ]);
  });
});

describe('reapplyCutoff', () => {
  it(`goes back ${REAPPLY_WINDOW_DAYS} days`, () => {
    expect(reapplyCutoff(new Date('2026-11-08T10:00:00.000Z'))).toEqual(
      new Date('2026-10-09T10:00:00.000Z'),
    );
  });
});
