import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/limits.js';
import {
  CulpritList,
  CulpritsQuery,
  Incident,
  IncidentList,
  SystemTimeline,
} from '../src/system.js';

const incident = {
  id: '0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e',
  type: 'memory',
  start: '2026-11-08T10:00:00Z',
  end: null,
  peak: 23.4,
  culprits: [{ pid: 99, comm: 'node', container: null, cpuPct: 12, rssBytes: 2e9 }],
};

describe('system', () => {
  it('accepts incidents, culprits, a timeline and a culprits query', () => {
    expect(Incident.safeParse(incident).success).toBe(true);
    expect(IncidentList.safeParse({ items: [incident] }).success).toBe(true);
    expect(
      CulpritList.safeParse({ items: [{ comm: 'node', container: 'web', incidents: 3 }] }).success,
    ).toBe(true);
    expect(
      SystemTimeline.safeParse({
        date: '2026-11-08',
        points: [{ ts: '2026-11-08T10:00:00Z', cpu: 1, memory: 0, io: 0 }],
        incidents: [incident],
      }).success,
    ).toBe(true);
    expect(CulpritsQuery.parse({ days: '7' })).toEqual({ days: 7 });
  });

  it('rejects unknown types, too many culprits and cmdlines', () => {
    expect(Incident.safeParse({ ...incident, type: 'disk' }).success).toBe(false);
    expect(
      Incident.safeParse({
        ...incident,
        culprits: Array(LIMITS.topProcesses + 1).fill(incident.culprits[0]),
      }).success,
    ).toBe(false);
    expect(
      Incident.safeParse({ ...incident, culprits: [{ ...incident.culprits[0], cmdline: 'x' }] })
        .success,
    ).toBe(false);
    expect(CulpritsQuery.safeParse({ days: '91' }).success).toBe(false);
  });
});
