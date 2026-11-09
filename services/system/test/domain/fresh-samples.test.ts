import type { PressureSample, ProcessSample, ThermalSample } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { freshSamples } from '../../src/domain/fresh-samples.js';

const NONE = { pressure: null, processes: null, thermal: null };

function at(clock: string): string {
  return `2026-11-08T${clock}.000Z`;
}

function pressure(clock: string, cpu = 1): PressureSample {
  return {
    kind: 'pressure',
    ts: at(clock),
    cpu: { some: cpu, full: 0 },
    memory: { some: 0, full: 0 },
    io: { some: 0, full: 0 },
    memAvailablePct: 50,
    swapActive: false,
  };
}

function processes(clock: string, comm = 'node', container?: string): ProcessSample {
  return {
    kind: 'processes',
    ts: at(clock),
    processes: [
      {
        pid: 42,
        comm,
        cpuPct: 1,
        rssBytes: 1,
        ioBytesPerSec: 0,
        ...(container === undefined ? {} : { container }),
      },
    ],
  };
}

function thermal(clock: string): ThermalSample {
  return { kind: 'thermal', ts: at(clock), cpuTempC: 50, throttled: false };
}

describe('freshSamples', () => {
  it('splits a batch by kind, oldest first', () => {
    const batch = [pressure('09:00:05'), thermal('09:00:00'), pressure('09:00:00')];

    const result = freshSamples(batch, NONE);

    expect(result.pressure.map((sample) => sample.ts)).toEqual([at('09:00:00'), at('09:00:05')]);
    expect(result.thermal).toHaveLength(1);
    expect(result.processes).toEqual([]);
    expect(result.accepted).toBe(batch.length);
    expect(result.late).toBe(0);
    expect(result.recordedUntil).toEqual({
      pressure: Date.parse(at('09:00:05')),
      processes: null,
      thermal: Date.parse(at('09:00:00')),
    });
  });

  it('drops samples at or before their own watermark as late', () => {
    const marks = { pressure: Date.parse(at('09:00:05')), processes: null, thermal: null };
    const batch = [
      pressure('09:00:00'),
      pressure('09:00:05'),
      pressure('09:00:10'),
      thermal('09:00:00'),
    ];

    const result = freshSamples(batch, marks);

    expect(result.pressure.map((sample) => sample.ts)).toEqual([at('09:00:10')]);
    expect(result.thermal).toHaveLength(1);
    expect(result.late).toBe(2);
  });

  it('keeps the first sample sent for a repeated timestamp', () => {
    const result = freshSamples([pressure('09:00:00', 1), pressure('09:00:00', 2)], NONE);

    expect(result.pressure.map((sample) => sample.cpu.some)).toEqual([1]);
    expect(result.late).toBe(1);
  });

  it('keeps the watermark of a kind the batch had nothing new for', () => {
    const marks = { pressure: null, processes: Date.parse(at('08:00:00')), thermal: null };

    const result = freshSamples([pressure('09:00:00')], marks);

    expect(result.recordedUntil.processes).toBe(marks.processes);
  });

  it('replaces NUL in process names and containers, which Postgres cannot store', () => {
    const result = freshSamples([processes('09:00:00', 'a\u0000b', 'c\u0000')], NONE);

    expect(result.processes[0]?.processes[0]).toMatchObject({ comm: 'a�b', container: 'c�' });
  });
});
