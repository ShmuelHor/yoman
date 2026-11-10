import type { PressureSample, ThermalSample } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { conditionPoints } from '../../src/domain/conditions.js';

const TS = '2026-11-08T09:00:00.000Z';
const TS_MS = Date.parse(TS);
const thresholds = { memory: 10, cpu: 40, io: 30 };
const SCARCE_PCT = 4.9;
const LIMIT_PCT = 5;
const HOT_C = 96;
const LIMIT_C = 95;
const COOL_C = 60;
const FROZEN_C = -5;

function pressure(overrides: Partial<PressureSample> = {}): PressureSample {
  return {
    kind: 'pressure',
    ts: TS,
    cpu: { some: 12, full: 0 },
    memory: { some: 2, full: 1 },
    io: { some: 5, full: 3 },
    memAvailablePct: 40,
    swapActive: false,
    ...overrides,
  };
}

function thermal(cpuTempC: number, throttled = false): ThermalSample {
  return { kind: 'thermal', ts: TS, cpuTempC, throttled };
}

describe('conditionPoints', () => {
  it('marks each pressure resource active only above its own threshold', () => {
    const sample = pressure({
      cpu: { some: 40.5, full: 0 },
      memory: { some: 10, full: 0 },
      io: { some: 31, full: 0 },
    });

    const points = conditionPoints([sample], [], thresholds);

    expect(points.cpu).toEqual([{ tsMs: TS_MS, active: true, value: 40.5 }]);
    expect(points.memory).toEqual([{ tsMs: TS_MS, active: false, value: 10 }]);
    expect(points.io).toEqual([{ tsMs: TS_MS, active: true, value: 31 }]);
  });

  it.each([
    ['below 5% available with swap active', SCARCE_PCT, true, true],
    ['below 5% available without swap', SCARCE_PCT, false, false],
    ['at 5% available with swap active', LIMIT_PCT, true, false],
  ])('treats memory %s as critical: %s', (_case, memAvailablePct, swapActive, active) => {
    const points = conditionPoints([pressure({ memAvailablePct, swapActive })], [], thresholds);

    expect(points['memory-critical']).toEqual([{ tsMs: TS_MS, active, value: 2 }]);
  });

  it.each([
    ['above 95 °C', HOT_C, false, true, HOT_C],
    ['at 95 °C', LIMIT_C, false, false, LIMIT_C],
    ['throttled while cool', COOL_C, true, true, COOL_C],
    ['below zero', FROZEN_C, false, false, 0],
  ])('treats a CPU %s as overheating: %s', (_case, temp, throttled, active, value) => {
    const points = conditionPoints([], [thermal(temp, throttled)], thresholds);

    expect(points.thermal).toEqual([{ tsMs: TS_MS, active, value }]);
  });
});
