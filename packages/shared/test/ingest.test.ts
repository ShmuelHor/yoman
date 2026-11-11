import { describe, expect, it } from 'vitest';
import { IngestBatch, IngestResult, Sample } from '../src/ingest.js';
import { LIMITS } from '../src/limits.js';

const ts = '2026-11-08T10:00:00Z';
const window = { kind: 'window', ts, wmClass: 'firefox', pid: 4242, idleMs: 0, locked: false };
const samples = [
  window,
  { ...window, title: 'Yoman – Mozilla Firefox' },
  {
    kind: 'battery',
    ts,
    energyFullWh: 48.2,
    energyFullDesignWh: 57,
    cycleCount: 312,
    powerW: 7.4,
    capacityPct: 81,
    status: 'discharging',
  },
  {
    kind: 'pressure',
    ts,
    cpu: { some: 2.1, full: 0 },
    memory: { some: 0, full: 0 },
    io: { some: 0.4, full: 0.1 },
    memAvailablePct: 42,
    swapActive: true,
  },
  {
    kind: 'processes',
    ts,
    processes: [
      { pid: 99, comm: 'node', cpuPct: 180, rssBytes: 1e9, ioBytesPerSec: 0, container: 'web' },
    ],
  },
  { kind: 'thermal', ts, cpuTempC: 71.5, throttled: false },
];

describe('Sample', () => {
  it.each(samples)('accepts a $kind sample', (sample) => {
    expect(Sample.safeParse(sample).success).toBe(true);
  });

  it('rejects unknown kinds, extra keys and out-of-range values', () => {
    expect(Sample.safeParse({ ...window, kind: 'keyboard' }).success).toBe(false);
    expect(Sample.safeParse({ ...window, cmdline: 'node --secret' }).success).toBe(false);
    expect(Sample.safeParse({ ...window, wmClass: 'bad class' }).success).toBe(false);
    expect(Sample.safeParse({ ...window, title: 'x'.repeat(LIMITS.titleLength + 1) }).success).toBe(
      false,
    );
    expect(Sample.safeParse({ ...window, pid: 0 }).success).toBe(false);
    expect(Sample.safeParse({ ...window, idleMs: -1 }).success).toBe(false);
    expect(Sample.safeParse({ ...window, ts: 'yesterday' }).success).toBe(false);
    expect(Sample.safeParse({ ...samples[2], capacityPct: 101 }).success).toBe(false);
  });

  it('rejects a process sample with a cmdline or too many processes', () => {
    const proc = { pid: 1, comm: 'a', cpuPct: 0, rssBytes: 0, ioBytesPerSec: 0 };
    expect(
      Sample.safeParse({ kind: 'processes', ts, processes: [{ ...proc, cmdline: 'a -p x' }] })
        .success,
    ).toBe(false);
    expect(
      Sample.safeParse({
        kind: 'processes',
        ts,
        processes: Array(LIMITS.processesPerSample + 1).fill(proc),
      }).success,
    ).toBe(false);
  });
});

describe('IngestBatch', () => {
  it('accepts a mixed batch', () => {
    expect(IngestBatch.safeParse({ agentVersion: '0.1.0', samples }).success).toBe(true);
  });

  it('rejects empty, oversized or unversioned batches', () => {
    expect(IngestBatch.safeParse({ agentVersion: '0.1.0', samples: [] }).success).toBe(false);
    expect(
      IngestBatch.safeParse({
        agentVersion: '0.1.0',
        samples: Array(LIMITS.ingestSamples + 1).fill(window),
      }).success,
    ).toBe(false);
    expect(IngestBatch.safeParse({ samples }).success).toBe(false);
  });
});

describe('IngestResult', () => {
  it('accepts a result and rejects a negative count', () => {
    const result = { accepted: 6, deliver: [], queued: 0, degraded: ['battery'] };
    expect(IngestResult.safeParse(result).success).toBe(true);
    expect(IngestResult.safeParse({ ...result, accepted: -1 }).success).toBe(false);
  });

  it('carries mute and restore commands with the focus end and system apps', () => {
    const mute = {
      mute: ['org.telegram.desktop'],
      restore: [],
      endsAt: '2026-01-01T10:00:00.000Z',
      systemApps: ['org.gnome.Settings'],
    };
    const result = { accepted: 1, deliver: [], queued: 0, degraded: [], mute };
    expect(IngestResult.safeParse(result).success).toBe(true);
    expect(
      IngestResult.safeParse({ ...result, mute: { ...mute, mute: ['bad id!'] } }).success,
    ).toBe(false);
    expect(IngestResult.safeParse({ ...result, mute: { ...mute, extra: 1 } }).success).toBe(false);
  });
});
