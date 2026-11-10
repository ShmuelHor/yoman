import type {
  PressureSample,
  ProcessInfo,
  ProcessSample,
  ThermalSample,
} from '@yoman/shared/ingest';

/** Fixture builders shared by the use case and route tests. Clocks are `HH:MM:SS` UTC. */

export const THRESHOLDS = { memory: 10, cpu: 40, io: 30 };
const SAMPLE_INTERVAL_MS = 5_000;

export function at(clock: string): string {
  return `2026-11-08T${clock}.000Z`;
}

export function pressure(
  clock: string,
  cpu: number,
  extra: Partial<PressureSample> = {},
): PressureSample {
  return {
    kind: 'pressure',
    ts: at(clock),
    cpu: { some: cpu, full: 0 },
    memory: { some: 1, full: 0 },
    io: { some: 1, full: 0 },
    memAvailablePct: 50,
    swapActive: false,
    ...extra,
  };
}

/** One pressure sample every 5 s, from `from` up to and including `to`. */
export function pressureRun(from: string, to: string, cpu: number): PressureSample[] {
  const samples: PressureSample[] = [];
  for (let tsMs = Date.parse(at(from)); tsMs <= Date.parse(at(to)); tsMs += SAMPLE_INTERVAL_MS) {
    samples.push({ ...pressure('00:00:00', cpu), ts: new Date(tsMs).toISOString() });
  }
  return samples;
}

export function process(pid: number, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return { pid, comm: `proc${pid}`, cpuPct: 1, rssBytes: 1_000, ioBytesPerSec: 0, ...extra };
}

export function processes(clock: string, list: ProcessInfo[]): ProcessSample {
  return { kind: 'processes', ts: at(clock), processes: list };
}

export function thermal(clock: string, cpuTempC: number, throttled = false): ThermalSample {
  return { kind: 'thermal', ts: at(clock), cpuTempC, throttled };
}
