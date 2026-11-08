import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppId,
  Category,
  ClockTime,
  Comm,
  DateQuery,
  EntityId,
  IdParams,
  Label,
  TimeRangeQuery,
  withDegraded,
} from '../src/common.js';
import { LIMITS } from '../src/limits.js';

describe('AppId', () => {
  it.each([
    'firefox',
    'org.gnome.Nautilus',
    'Google-chrome',
    'code_oss',
    'a'.repeat(LIMITS.appIdLength),
  ])('accepts %s', (id) => {
    expect(AppId.safeParse(id).success).toBe(true);
  });

  it.each([
    '',
    'a'.repeat(LIMITS.appIdLength + 1),
    'my app',
    '../etc/passwd',
    'app;rm',
    "a'b",
    '\u05e7\u05d5\u05d3',
    'a\nb',
  ])('rejects %j', (id) => {
    expect(AppId.safeParse(id).success).toBe(false);
  });
});

describe('primitives', () => {
  it('accepts valid values', () => {
    expect(EntityId.parse('0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e')).toBeTruthy();
    expect(ClockTime.parse('23:59')).toBe('23:59');
    expect(Category.parse('social-media')).toBe('social-media');
    expect(Label.parse('  Firefox  ')).toBe('Firefox');
    expect(Comm.parse('node')).toBe('node');
  });

  it('rejects invalid values', () => {
    expect(EntityId.safeParse('1').success).toBe(false);
    expect(ClockTime.safeParse('24:00').success).toBe(false);
    expect(Category.safeParse('Work').success).toBe(false);
    expect(Label.safeParse('   ').success).toBe(false);
    expect(Comm.safeParse('').success).toBe(false);
  });
});

describe('query and params schemas', () => {
  it('accepts a valid range, date and id', () => {
    expect(
      TimeRangeQuery.safeParse({ from: '2026-11-01T00:00:00Z', to: '2026-11-08T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(DateQuery.safeParse({ date: '2026-11-08' }).success).toBe(true);
    expect(IdParams.safeParse({ id: '0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e' }).success).toBe(true);
  });

  it('rejects reversed, unbounded, malformed or extra input', () => {
    expect(
      TimeRangeQuery.safeParse({ from: '2026-11-08T00:00:00Z', to: '2026-11-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(
      TimeRangeQuery.safeParse({ from: '2020-01-01T00:00:00Z', to: '2026-11-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(DateQuery.safeParse({ date: '08/11/2026' }).success).toBe(false);
    expect(DateQuery.safeParse({ date: '2026-11-08', extra: '1' }).success).toBe(false);
    expect(IdParams.safeParse({ id: "1' OR '1'='1" }).success).toBe(false);
  });
});

describe('withDegraded', () => {
  const Envelope = withDegraded(z.strictObject({ n: z.number() }));

  it('accepts data with the degraded services', () => {
    expect(Envelope.safeParse({ data: { n: 1 }, degraded: ['battery'] }).success).toBe(true);
  });

  it('rejects unknown services and extra keys', () => {
    expect(Envelope.safeParse({ data: { n: 1 }, degraded: ['gateway'] }).success).toBe(false);
    expect(Envelope.safeParse({ data: { n: 1 }, degraded: [], x: 1 }).success).toBe(false);
  });
});
