import { z } from 'zod';
import { Alert } from './alerts.js';
import { AppId, Bytes, Comm, Label, Percent, Pid, ServiceName, Timestamp } from './common.js';
import { LIMITS } from './limits.js';

/** The focused window, idle time and lock state, every 5 s (SPEC §4.1, §5 sessions). */
export const WindowSample = z.strictObject({
  kind: z.literal('window'),
  ts: Timestamp,
  wmClass: AppId,
  /** Untrusted. Sent only when the privacy setting allows storing titles. */
  title: z.string().max(LIMITS.titleLength).optional(),
  pid: Pid,
  idleMs: z.int().min(0).max(LIMITS.idleMs),
  locked: z.boolean(),
});
export type WindowSample = z.infer<typeof WindowSample>;

export const BatteryStatus = z.enum(['charging', 'discharging', 'full', 'not-charging', 'unknown']);
export type BatteryStatus = z.infer<typeof BatteryStatus>;

/** `/sys/class/power_supply/BAT*`, every 60 s. Energy in Wh, power in W. */
export const BatterySample = z.strictObject({
  kind: z.literal('battery'),
  ts: Timestamp,
  energyFullWh: z.number().min(0).max(LIMITS.watts),
  energyFullDesignWh: z.number().positive().max(LIMITS.watts),
  cycleCount: z.int().min(0).max(LIMITS.cycles),
  powerW: z.number().min(0).max(LIMITS.watts),
  capacityPct: Percent,
  status: BatteryStatus,
});
export type BatterySample = z.infer<typeof BatterySample>;

export const PressureValues = z.strictObject({ some: Percent, full: Percent });
export type PressureValues = z.infer<typeof PressureValues>;

/** `/proc/pressure/*` `avg10` values, plus available memory and swap for the critical rule. */
export const PressureSample = z.strictObject({
  kind: z.literal('pressure'),
  ts: Timestamp,
  cpu: PressureValues,
  memory: PressureValues,
  io: PressureValues,
  memAvailablePct: Percent,
  swapActive: z.boolean(),
});
export type PressureSample = z.infer<typeof PressureSample>;

export const ProcessInfo = z.strictObject({
  pid: Pid,
  comm: Comm,
  cpuPct: z.number().min(0).max(LIMITS.processCpuPct),
  rssBytes: Bytes,
  ioBytesPerSec: Bytes,
  /** The container name, from the cgroup path. */
  container: Label.optional(),
});
export type ProcessInfo = z.infer<typeof ProcessInfo>;

/** The top processes, collected only under load and every 5 min. */
export const ProcessSample = z.strictObject({
  kind: z.literal('processes'),
  ts: Timestamp,
  processes: z.array(ProcessInfo).max(LIMITS.processesPerSample),
});
export type ProcessSample = z.infer<typeof ProcessSample>;

export const ThermalSample = z.strictObject({
  kind: z.literal('thermal'),
  ts: Timestamp,
  cpuTempC: z.number().min(-LIMITS.celsius).max(LIMITS.celsius),
  throttled: z.boolean(),
});
export type ThermalSample = z.infer<typeof ThermalSample>;

export const Sample = z.discriminatedUnion('kind', [
  WindowSample,
  BatterySample,
  PressureSample,
  ProcessSample,
  ThermalSample,
]);
export type Sample = z.infer<typeof Sample>;

/** `POST /v1/ingest`: one batch from the agent's buffer (SPEC §4.3). */
export const IngestBatch = z.strictObject({
  agentVersion: z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/),
  samples: z.array(Sample).min(1).max(LIMITS.ingestSamples),
});
export type IngestBatch = z.infer<typeof IngestBatch>;

/** The focus decisions for this batch's alerts go back to the agent (SPEC §3 ingest flow). */
export const IngestResult = z.strictObject({
  accepted: z.int().min(0).max(LIMITS.ingestSamples),
  deliver: z.array(Alert).max(LIMITS.listSize),
  queued: z.int().min(0).max(LIMITS.listSize),
  degraded: z.array(ServiceName).max(ServiceName.options.length),
});
export type IngestResult = z.infer<typeof IngestResult>;
