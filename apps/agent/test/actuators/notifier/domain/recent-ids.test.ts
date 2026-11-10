import { describe, expect, it } from 'vitest';
import { RecentIds } from '../../../../src/actuators/notifier/domain/recent-ids.js';

const CAPACITY = 2;
const FIRST = 101;
const SECOND = 102;
const THIRD = 103;

describe('RecentIds', () => {
  it('remembers ids it was given', () => {
    const ids = new RecentIds(CAPACITY);

    ids.add(FIRST);

    expect(ids.has(FIRST)).toBe(true);
    expect(ids.has(SECOND)).toBe(false);
  });

  it('forgets the oldest id beyond its capacity', () => {
    const ids = new RecentIds(CAPACITY);

    ids.add(FIRST);
    ids.add(SECOND);
    ids.add(THIRD);

    expect([ids.has(FIRST), ids.has(SECOND), ids.has(THIRD)]).toEqual([false, true, true]);
    expect(ids.size).toBe(CAPACITY);
  });

  it('treats a re-added id as the newest', () => {
    const ids = new RecentIds(CAPACITY);

    ids.add(FIRST);
    ids.add(SECOND);
    ids.add(FIRST);
    ids.add(THIRD);

    expect([ids.has(FIRST), ids.has(SECOND), ids.has(THIRD)]).toEqual([true, false, true]);
  });

  it('reports whether a deleted id was known', () => {
    const ids = new RecentIds(CAPACITY);
    ids.add(FIRST);

    expect(ids.delete(FIRST)).toBe(true);
    expect(ids.delete(FIRST)).toBe(false);
  });
});
