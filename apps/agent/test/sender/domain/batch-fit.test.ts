import { describe, expect, it } from 'vitest';
import { fittingSampleCount } from '../../../src/sender/domain/batch-fit.js';

const ENVELOPE_BYTES = 40;
const LIMIT_BYTES = 1_000;
const SMALL = 100;
const LARGE = 900;
const TOO_LARGE = 2_000;

describe('fittingSampleCount', () => {
  it('counts the envelope, every sample and the commas between them', () => {
    const values = ['aa', 'bbb', 'c'];
    const body = JSON.stringify({ samples: values });
    const envelope = JSON.stringify({ samples: [] }).length;
    const sizes = values.map((value) => JSON.stringify(value).length);

    expect(fittingSampleCount(envelope, sizes, body.length)).toBe(values.length);
    expect(fittingSampleCount(envelope, sizes, body.length - 1)).toBe(values.length - 1);
  });

  it('keeps every sample when the batch is small', () => {
    const sizes = [SMALL, SMALL, SMALL];
    expect(fittingSampleCount(ENVELOPE_BYTES, sizes, LIMIT_BYTES)).toBe(sizes.length);
  });

  it('stops at the first sample that would push the body over the limit', () => {
    expect(fittingSampleCount(ENVELOPE_BYTES, [SMALL, LARGE, 1], LIMIT_BYTES)).toBe(1);
  });

  it('returns zero when not even one sample fits', () => {
    expect(fittingSampleCount(ENVELOPE_BYTES, [TOO_LARGE], LIMIT_BYTES)).toBe(0);
  });

  it('returns zero for an empty buffer', () => {
    expect(fittingSampleCount(ENVELOPE_BYTES, [], LIMIT_BYTES)).toBe(0);
  });
});
