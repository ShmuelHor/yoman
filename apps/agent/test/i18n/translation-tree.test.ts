import { describe, expect, it } from 'vitest';
import {
  interpolate,
  lookupMessage,
  MISSING_VALUE,
  TranslationTree,
} from '../../src/i18n/translation-tree.js';

const TREE: TranslationTree = {
  notifications: { batteryLow: { title: 'Battery low' } },
  flat: 'top level',
};

describe('lookupMessage', () => {
  it('finds a nested message by its dotted key', () => {
    expect(lookupMessage(TREE, 'notifications.batteryLow.title')).toBe('Battery low');
  });

  it('finds a top-level message', () => {
    expect(lookupMessage(TREE, 'flat')).toBe('top level');
  });

  it('returns undefined for a missing key', () => {
    expect(lookupMessage(TREE, 'notifications.batteryLow.body')).toBeUndefined();
  });

  it('returns undefined for a key that names a branch, not a message', () => {
    expect(lookupMessage(TREE, 'notifications.batteryLow')).toBeUndefined();
  });

  it('returns undefined for a key that goes past a message', () => {
    expect(lookupMessage(TREE, 'flat.deeper')).toBeUndefined();
  });

  it('never resolves inherited object properties', () => {
    expect(lookupMessage(TREE, 'notifications.constructor')).toBeUndefined();
    expect(lookupMessage(TREE, '__proto__')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('replaces every placeholder with its value', () => {
    const result = interpolate('{{a}} and {{ b }} and {{a}}', { a: '1', b: '2' });

    expect(result).toEqual({ text: '1 and 2 and 1', missing: [] });
  });

  it('marks a placeholder without a value and reports its name', () => {
    const result = interpolate('{{percent}}% left', {});

    expect(result).toEqual({ text: `${MISSING_VALUE}% left`, missing: ['percent'] });
  });

  it('inserts values literally, without expanding placeholders inside them', () => {
    const result = interpolate('{{a}}', { a: '{{b}}', b: 'nope' });

    expect(result.text).toBe('{{b}}');
  });

  it('ignores values that inherit from Object.prototype', () => {
    const result = interpolate('{{toString}}', {});

    expect(result.missing).toEqual(['toString']);
  });
});

describe('TranslationTree', () => {
  it('accepts nested messages', () => {
    expect(TranslationTree.safeParse(TREE).success).toBe(true);
  });

  it('rejects a non-string leaf', () => {
    expect(TranslationTree.safeParse({ a: 1 }).success).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(TranslationTree.safeParse({ a: '' }).success).toBe(false);
  });

  it('rejects a key that would break dotted paths', () => {
    expect(TranslationTree.safeParse({ 'a.b': 'x' }).success).toBe(false);
  });
});
