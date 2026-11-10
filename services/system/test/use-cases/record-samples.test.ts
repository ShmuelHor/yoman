import { Alert } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';

import type { SampleBatch } from '../../src/contracts.js';
import { RETENTION_MS, recordSamples } from '../../src/use-cases/record-samples.js';
import { createMemoryStore } from '../memory-store.js';
import { at, pressure, pressureRun, process, processes, THRESHOLDS, thermal } from '../samples.js';

const NOW_MS = Date.parse('2026-11-08T10:00:00.000Z');
const HIGH_CPU = 60;
const LOW_CPU = 5;
const GIB = 1_073_741_824;
const MINUTE_MS = 60_000;
const LEAK_SNAPSHOTS = 13;
const SNAPSHOT_INTERVAL_MIN = 5;
const MINUTES_PER_HOUR = 60;
const LEAK_BYTES_PER_HOUR = 2 * GIB;
const LEAK_PID = 7;
const QUIET_PID = 3;
const RUNAWAY_CPU_PCT = 400;
const BUSY_CPU_PCT = 95;
const SCARCE_MEMORY_PCT = 3;
const HOT_C = 97;
/** `HH:MM:SS` of an ISO timestamp. */
const CLOCK = { start: 11, end: 19 } as const;

function batch(samples: SampleBatch['samples']): SampleBatch {
  return { thresholds: THRESHOLDS, samples };
}

describe('recordSamples', () => {
  it('opens no incident for a short spike', async () => {
    const store = createMemoryStore();
    const samples = [
      ...pressureRun('09:00:00', '09:00:10', HIGH_CPU),
      pressure('09:00:15', LOW_CPU),
    ];

    const result = await recordSamples(store, batch(samples), NOW_MS);

    expect(result).toEqual({ accepted: 4, late: 0, alerts: [] });
    expect(store.state().incidents).toEqual([]);
  });

  it('opens exactly one incident and one alert for sustained load, across batches', async () => {
    const store = createMemoryStore();

    const first = await recordSamples(
      store,
      batch(pressureRun('09:00:00', '09:00:55', HIGH_CPU)),
      NOW_MS,
    );
    const second = await recordSamples(
      store,
      batch(pressureRun('09:01:00', '09:01:55', HIGH_CPU)),
      NOW_MS,
    );

    const { incidents } = store.state();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      type: 'cpu',
      startMs: Date.parse(at('09:00:00')),
      endMs: null,
    });
    expect(first.alerts.map((alert) => Alert.parse(alert).alertKey)).toEqual(['system:cpu']);
    expect(second.alerts).toEqual([]);
  });

  it('applies a retried batch once', async () => {
    const store = createMemoryStore();
    const samples = pressureRun('09:00:00', '09:00:55', HIGH_CPU);

    await recordSamples(store, batch(samples), NOW_MS);
    const retry = await recordSamples(store, batch(samples), NOW_MS);

    expect(retry).toEqual({ accepted: 0, late: samples.length, alerts: [] });
    expect(store.state().incidents).toHaveLength(1);
    expect(store.state().pressure).toHaveLength(samples.length);
  });

  it('blames the incident on the processes seen while it lasted', async () => {
    const store = createMemoryStore();
    const samples = [
      processes('08:59:00', [process(1, { cpuPct: RUNAWAY_CPU_PCT })]),
      ...pressureRun('09:00:00', '09:00:30', HIGH_CPU),
      processes('09:00:10', [
        process(2, { cpuPct: BUSY_CPU_PCT, container: 'yoman-web-1' }),
        process(QUIET_PID),
      ]),
      pressure('09:00:35', LOW_CPU),
    ];

    await recordSamples(store, batch(samples), NOW_MS);

    const [incident] = store.state().incidents;
    expect(incident?.endMs).toBe(Date.parse(at('09:00:35')));
    expect(incident?.culprits.map((culprit) => [culprit.pid, culprit.container])).toEqual([
      [2, 'yoman-web-1'],
      [QUIET_PID, null],
    ]);
  });

  it('uses the thresholds the gateway sends', async () => {
    const store = createMemoryStore();
    const strict = { ...THRESHOLDS, cpu: 4 };

    await recordSamples(
      store,
      { thresholds: strict, samples: pressureRun('09:00:00', '09:00:30', LOW_CPU) },
      NOW_MS,
    );

    expect(store.state().incidents.map((incident) => incident.type)).toEqual(['cpu']);
  });

  it('raises a critical alert near OOM and an important one for overheating', async () => {
    const store = createMemoryStore();
    const samples = [
      pressure('09:00:00', LOW_CPU, { memAvailablePct: SCARCE_MEMORY_PCT, swapActive: true }),
      thermal('09:00:00', HOT_C),
    ];

    const result = await recordSamples(store, batch(samples), NOW_MS);

    expect(result.alerts.map((alert) => [alert.type, alert.level])).toEqual([
      ['memory-critical', 'critical'],
      ['thermal', 'important'],
    ]);
  });

  it('opens a leak incident for a process growing over 1 GiB an hour', async () => {
    const store = createMemoryStore();
    const samples = Array.from({ length: LEAK_SNAPSHOTS }, (_, index) => {
      const minute = index * SNAPSHOT_INTERVAL_MIN;
      const clock = new Date(Date.parse(at('08:00:00')) + minute * MINUTE_MS)
        .toISOString()
        .slice(CLOCK.start, CLOCK.end);
      return processes(clock, [
        process(LEAK_PID, {
          comm: 'node',
          rssBytes: Math.round(GIB + (minute / MINUTES_PER_HOUR) * LEAK_BYTES_PER_HOUR),
        }),
      ]);
    });

    const result = await recordSamples(store, batch(samples), NOW_MS);

    expect(result.alerts.map((alert) => [alert.alertKey, alert.level])).toEqual([
      [`system:memory-leak:${LEAK_PID}`, 'important'],
    ]);
    expect(store.state().incidents).toMatchObject([
      {
        type: 'memory-leak',
        pid: LEAK_PID,
        peak: LEAK_BYTES_PER_HOUR,
        startMs: Date.parse(at('08:00:00')),
      },
    ]);
  });

  it('prunes samples and snapshots older than 7 days', async () => {
    const store = createMemoryStore();
    const old = new Date(NOW_MS - RETENTION_MS - MINUTE_MS).toISOString();

    await recordSamples(store, batch([{ ...pressure('00:00:00', LOW_CPU), ts: old }]), NOW_MS);
    await recordSamples(store, batch([pressure('09:00:00', LOW_CPU)]), NOW_MS);

    expect(store.state().pressure.map((sample) => sample.ts)).toEqual([at('09:00:00')]);
  });
});
