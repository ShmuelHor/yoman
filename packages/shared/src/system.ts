import { z } from 'zod';
import { Bytes, Comm, EntityId, Label, LocalDate, Percent, Pid, Timestamp } from './common.js';
import { LIMITS } from './limits.js';

export const IncidentType = z.enum([
  'cpu',
  'memory',
  'io',
  'memory-critical',
  'thermal',
  'memory-leak',
]);
export type IncidentType = z.infer<typeof IncidentType>;

export const Culprit = z.strictObject({
  pid: Pid,
  comm: Comm,
  container: Label.nullable(),
  cpuPct: z.number().min(0).max(LIMITS.processCpuPct),
  rssBytes: Bytes,
});
export type Culprit = z.infer<typeof Culprit>;

export const Incident = z.strictObject({
  id: EntityId,
  type: IncidentType,
  start: Timestamp,
  /** `null` while the incident is still open. */
  end: Timestamp.nullable(),
  /** The peak `avg10` for pressure incidents, °C for thermal, bytes/hour for leaks. */
  peak: z.number().finite().min(0),
  culprits: z.array(Culprit).max(LIMITS.topProcesses),
});
export type Incident = z.infer<typeof Incident>;

export const IncidentList = z.strictObject({ items: z.array(Incident).max(LIMITS.listSize) });
export type IncidentList = z.infer<typeof IncidentList>;

export const CulpritsQuery = z.strictObject({
  days: z.coerce.number().int().min(1).max(LIMITS.culpritDays),
});
export type CulpritsQuery = z.infer<typeof CulpritsQuery>;

export const CulpritSummary = z.strictObject({
  comm: Comm,
  container: Label.nullable(),
  incidents: z.int().min(1).max(LIMITS.listSize),
});
export type CulpritSummary = z.infer<typeof CulpritSummary>;

export const CulpritList = z.strictObject({ items: z.array(CulpritSummary).max(LIMITS.listSize) });
export type CulpritList = z.infer<typeof CulpritList>;

export const PressurePoint = z.strictObject({
  ts: Timestamp,
  cpu: Percent,
  memory: Percent,
  io: Percent,
});
export type PressurePoint = z.infer<typeof PressurePoint>;

export const SystemTimeline = z.strictObject({
  date: LocalDate,
  points: z.array(PressurePoint).max(LIMITS.timelinePoints),
  incidents: z.array(Incident).max(LIMITS.listSize),
});
export type SystemTimeline = z.infer<typeof SystemTimeline>;
