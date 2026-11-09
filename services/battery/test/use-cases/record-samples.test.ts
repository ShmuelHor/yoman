import { describe, expect, it } from 'vitest';

import { recordSamples } from '../../src/use-cases/record-samples.js';
import { batterySample } from '../fixtures.js';
import { createMemoryStore } from '../memory-store.js';

const UTC = 'UTC';
const JERUSALEM = 'Asia/Jerusalem';
const LOW_PCT = 14;
/** 54 of 60 Wh. */
const HEALTH_PCT = 90;
const CYCLES = 312;
const DRAW_W = 10;
const MORE_DRAW_W = 14;
const AVERAGE_W = 12;

describe('recordSamples', () => {
  it('stores samples with their date and health', async () => {
    const store = createMemoryStore();

    const result = await recordSamples(store, [batterySample('09:00')], UTC);

    expect(result).toEqual({ accepted: 1, duplicates: 0, alerts: [] });
    expect(store.state().samples).toMatchObject([{ date: '2026-11-08', healthPct: HEALTH_PCT }]);
  });

  it('summarizes each day from every sample stored for it, across batches', async () => {
    const store = createMemoryStore();

    await recordSamples(store, [batterySample('09:00', { powerW: DRAW_W })], UTC);
    await recordSamples(store, [batterySample('09:01', { powerW: MORE_DRAW_W })], UTC);

    expect(store.state().days).toEqual([
      { date: '2026-11-08', healthPct: HEALTH_PCT, cycles: CYCLES, averageW: AVERAGE_W },
    ]);
  });

  it('dates samples by the local day in the configured zone', async () => {
    const store = createMemoryStore();
    // 23:30 UTC is already 01:30 the next morning in Jerusalem.
    const lateEvening = batterySample('23:30');

    await recordSamples(store, [lateEvening], JERUSALEM);

    expect(store.state().days.map((day) => day.date)).toEqual(['2026-11-09']);
  });

  it('summarizes every day a backlog batch spans', async () => {
    const store = createMemoryStore();
    const nextDay = { ts: '2026-11-09T09:00:00.000Z' };

    await recordSamples(store, [batterySample('09:00'), batterySample('09:00', nextDay)], UTC);

    expect(store.state().days.map((day) => day.date)).toEqual(['2026-11-08', '2026-11-09']);
  });

  it('drops a retried batch and raises its alerts only once', async () => {
    const store = createMemoryStore();
    const batch = [batterySample('09:00'), batterySample('09:01', { capacityPct: LOW_PCT })];

    const first = await recordSamples(store, batch, UTC);
    const retry = await recordSamples(store, batch, UTC);

    expect(first.alerts.map((alert) => alert.type)).toEqual(['battery-low']);
    expect(retry).toEqual({ accepted: 0, duplicates: 2, alerts: [] });
    expect(store.state().samples).toHaveLength(2);
  });

  it('keeps the alert state between batches', async () => {
    const store = createMemoryStore();

    await recordSamples(store, [batterySample('09:00', { capacityPct: LOW_PCT })], UTC);
    const next = await recordSamples(
      store,
      [batterySample('09:01', { capacityPct: LOW_PCT })],
      UTC,
    );

    expect(next.alerts).toEqual([]);
    expect(store.state().alertState.drain).toBe('low');
  });
});
