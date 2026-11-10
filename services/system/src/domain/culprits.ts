import { LIMITS } from '@yoman/shared/limits';
import type { Culprit, IncidentType } from '@yoman/shared/system';

/** One process at its worst over a span of time: the maximum of each measure. */
export interface ProcessPeak {
  readonly pid: number;
  readonly comm: string;
  /** From the newest snapshot. */
  readonly container: string | null;
  readonly cpuPct: number;
  readonly rssBytes: number;
  readonly ioBytesPerSec: number;
}

type Measure = 'cpuPct' | 'rssBytes' | 'ioBytesPerSec';

/** What each incident is blamed on: the resource it is about. Heat comes from CPU work. */
const MEASURE_BY_TYPE: Readonly<Record<IncidentType, Measure>> = {
  cpu: 'cpuPct',
  memory: 'rssBytes',
  io: 'ioBytesPerSec',
  'memory-critical': 'rssBytes',
  thermal: 'cpuPct',
  'memory-leak': 'rssBytes',
};

function toCulprit(peak: ProcessPeak): Culprit {
  return {
    pid: peak.pid,
    comm: peak.comm,
    container: peak.container,
    cpuPct: peak.cpuPct,
    rssBytes: peak.rssBytes,
  };
}

/**
 * The top processes by the incident's own resource, worst first. A process
 * that used none of it is no culprit. Ties go to the lower pid, then to the
 * name, so the result never depends on row order.
 */
export function rankCulprits(type: IncidentType, peaks: readonly ProcessPeak[]): Culprit[] {
  const measure = MEASURE_BY_TYPE[type];
  return peaks
    .filter((peak) => peak[measure] > 0)
    .sort(
      (a, b) =>
        b[measure] - a[measure] ||
        a.pid - b.pid ||
        (a.comm < b.comm ? -1 : Number(a.comm > b.comm)),
    )
    .slice(0, LIMITS.topProcesses)
    .map(toCulprit);
}
