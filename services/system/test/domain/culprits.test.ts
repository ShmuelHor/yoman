import { describe, expect, it } from 'vitest';

import { type ProcessPeak, rankCulprits } from '../../src/domain/culprits.js';

const GIB = 1_073_741_824;
const LARGE_RSS = 4_294_967_296;
const TOP = 10;

/** A busy process, a large one in a container, and one doing only IO. */
const BUSY = 1;
const LARGE = 2;
const DISK = 3;

function peak(pid: number, overrides: Partial<ProcessPeak> = {}): ProcessPeak {
  return {
    pid,
    comm: `proc${pid}`,
    container: null,
    cpuPct: 0,
    rssBytes: 0,
    ioBytesPerSec: 0,
    ...overrides,
  };
}

describe('rankCulprits', () => {
  const busy = peak(BUSY, { cpuPct: 90, rssBytes: GIB });
  const large = peak(LARGE, { cpuPct: 10, rssBytes: LARGE_RSS, container: 'yoman-web-1' });
  const disk = peak(DISK, { ioBytesPerSec: 5_000_000 });
  const peaks = [busy, large, disk];

  it('blames a CPU incident on CPU use', () => {
    expect(rankCulprits('cpu', peaks).map((culprit) => culprit.pid)).toEqual([BUSY, LARGE]);
  });

  it('blames memory incidents on resident memory, without IO', () => {
    expect(rankCulprits('memory', peaks)).toEqual([
      {
        pid: LARGE,
        comm: large.comm,
        container: 'yoman-web-1',
        cpuPct: large.cpuPct,
        rssBytes: large.rssBytes,
      },
      { pid: BUSY, comm: busy.comm, container: null, cpuPct: busy.cpuPct, rssBytes: GIB },
    ]);
    expect(rankCulprits('memory-critical', peaks).map((culprit) => culprit.pid)).toEqual([
      LARGE,
      BUSY,
    ]);
  });

  it('blames an IO incident on IO only', () => {
    expect(rankCulprits('io', peaks).map((culprit) => culprit.pid)).toEqual([DISK]);
  });

  it('blames overheating on CPU use', () => {
    expect(rankCulprits('thermal', peaks).map((culprit) => culprit.pid)).toEqual([BUSY, LARGE]);
  });

  it('keeps the top ten, breaking ties by pid then name', () => {
    const tied = Array.from({ length: TOP + BUSY }, (_, index) =>
      peak(TOP * LARGE - index, { cpuPct: 50 }),
    );
    const lowest = Math.min(...tied.map((item) => item.pid));
    const twins = [peak(lowest, { comm: 'b' }), peak(lowest, { comm: 'a' })].map((twin) => ({
      ...twin,
      cpuPct: 50,
    }));

    const ranked = rankCulprits('cpu', [...tied, ...twins]);

    expect(ranked).toHaveLength(TOP);
    expect(ranked.slice(0, DISK).map((culprit) => [culprit.pid, culprit.comm])).toEqual([
      [lowest, 'a'],
      [lowest, 'b'],
      [lowest, `proc${lowest}`],
    ]);
  });
});
