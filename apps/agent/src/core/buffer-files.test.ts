import { describe, expect, it } from 'vitest';
import { hourFileName, isBufferFileName, selectEvictions, splitLines } from './buffer-files.js';

describe('hourFileName', () => {
  it('names a file after the UTC hour', () => {
    expect(hourFileName(new Date('2026-11-08T21:59:59.999Z'))).toBe('2026-11-08T21.jsonl');
  });

  it('produces names the buffer recognizes', () => {
    expect(isBufferFileName(hourFileName(new Date()))).toBe(true);
    expect(isBufferFileName('2026-11-08T21.jsonl.tmp')).toBe(false);
    expect(isBufferFileName('notes.txt')).toBe(false);
  });

  it('sorts chronologically by name, across days, months and years', () => {
    const times = [
      '2026-12-31T23:00:00Z',
      '2027-01-01T00:00:00Z',
      '2027-01-01T09:00:00Z',
      '2027-01-01T10:00:00Z',
      '2027-10-01T00:00:00Z',
    ].map((iso) => hourFileName(new Date(iso)));
    expect([...times].sort()).toEqual(times);
  });
});

describe('selectEvictions', () => {
  const files = [
    { name: 'c', size: 10 },
    { name: 'a', size: 30 },
    { name: 'b', size: 20 },
  ];

  it('keeps everything under the cap', () => {
    expect(selectEvictions(files, 60)).toEqual([]);
  });

  it('drops the oldest files first until the rest fit', () => {
    const total = 60;
    const newestTwo = 30;
    expect(selectEvictions(files, total - 1)).toEqual(['a']);
    expect(selectEvictions(files, newestTwo - 1)).toEqual(['a', 'b']);
  });

  it('drops even the newest file if it alone is over the cap', () => {
    expect(selectEvictions(files, 0)).toEqual(['a', 'b', 'c']);
  });

  it('always leaves at most maxBytes behind', () => {
    for (let max = 0; max <= 60 + 10; max += 1) {
      const evicted = new Set(selectEvictions(files, max));
      const left = files.filter((file) => !evicted.has(file.name));
      expect(left.reduce((sum, file) => sum + file.size, 0)).toBeLessThanOrEqual(max);
    }
  });
});

describe('splitLines', () => {
  it('returns each line with the offset after it', () => {
    expect(splitLines(Buffer.from('ab\ncd\n'))).toEqual([
      { text: 'ab', end: 3 },
      { text: 'cd', end: 6 },
    ]);
  });

  it('returns a trailing partial line', () => {
    expect(splitLines(Buffer.from('ab\ncd'))).toEqual([
      { text: 'ab', end: 3 },
      { text: 'cd', end: 5 },
    ]);
  });

  it('counts bytes, not characters', () => {
    const line = 'caf\u00e9\n';
    expect(splitLines(Buffer.from(line))[0]?.end).toBe(line.length + 1);
  });

  it('handles an empty file', () => {
    expect(splitLines(Buffer.alloc(0))).toEqual([]);
  });
});
