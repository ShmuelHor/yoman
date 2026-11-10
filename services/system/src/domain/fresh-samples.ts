import type {
  PressureSample,
  ProcessInfo,
  ProcessSample,
  ThermalSample,
} from '@yoman/shared/ingest';

import { withoutNul } from './text.js';

export type SystemSampleKind = 'pressure' | 'processes' | 'thermal';

/** The newest sample of each kind any batch applied, or `null` before the first one. */
export type Watermarks = Readonly<Record<SystemSampleKind, number | null>>;

export interface FreshSamples {
  readonly pressure: readonly PressureSample[];
  readonly processes: readonly ProcessSample[];
  readonly thermal: readonly ThermalSample[];
  /** Samples that will be applied. */
  readonly accepted: number;
  /** Samples at or before their kind's watermark, or repeating a timestamp: a retry or an overlap. */
  readonly late: number;
  /** The watermarks once this batch is applied. */
  readonly recordedUntil: Watermarks;
}

/**
 * Oldest first, newer than `mark`, one per timestamp. The sort is stable, so of
 * two samples with the same timestamp the first one sent wins.
 */
function fresh<T extends { readonly ts: string }>(samples: readonly T[], mark: number | null): T[] {
  const sorted = samples
    .map((sample) => ({ sample, tsMs: Date.parse(sample.ts) }))
    .sort((a, b) => a.tsMs - b.tsMs);
  return sorted
    .filter(({ tsMs }, index) => index === 0 || tsMs !== sorted[index - 1]?.tsMs)
    .filter(({ tsMs }) => mark === null || tsMs > mark)
    .map(({ sample }) => sample);
}

function newest(samples: readonly { readonly ts: string }[], mark: number | null): number | null {
  const last = samples.at(-1);
  return last === undefined ? mark : Date.parse(last.ts);
}

function storable(process: ProcessInfo): ProcessInfo {
  const { container, ...rest } = process;
  return {
    ...rest,
    comm: withoutNul(process.comm),
    ...(container === undefined ? {} : { container: withoutNul(container) }),
  };
}

/**
 * Splits a batch by kind and drops what an earlier batch already applied, so
 * a retried or overlapping batch never counts the same moment twice. Process
 * names come out storable, so one process matches itself across batches.
 */
export function freshSamples(
  samples: readonly (PressureSample | ProcessSample | ThermalSample)[],
  marks: Watermarks,
): FreshSamples {
  const pressure = fresh(
    samples.filter((sample) => sample.kind === 'pressure'),
    marks.pressure,
  );
  const processes = fresh(
    samples.filter((sample) => sample.kind === 'processes'),
    marks.processes,
  ).map((sample) => ({ ...sample, processes: sample.processes.map(storable) }));
  const thermal = fresh(
    samples.filter((sample) => sample.kind === 'thermal'),
    marks.thermal,
  );
  const accepted = pressure.length + processes.length + thermal.length;
  return {
    pressure,
    processes,
    thermal,
    accepted,
    late: samples.length - accepted,
    recordedUntil: {
      pressure: newest(pressure, marks.pressure),
      processes: newest(processes, marks.processes),
      thermal: newest(thermal, marks.thermal),
    },
  };
}
