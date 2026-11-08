/**
 * Upper bounds for everything that crosses the public API. Every string, number and
 * array in a contract is bounded so an unexpected payload is rejected at the boundary
 * instead of reaching a service (SECURITY A18).
 */
export const LIMITS = {
  appIdLength: 128,
  nameLength: 128,
  titleLength: 512,
  /** Linux `comm` is at most 15 bytes plus NUL; 64 leaves room for multibyte UTF-8. */
  commLength: 64,
  patternLength: 256,
  categoryLength: 32,
  paramKeyLength: 32,
  paramValueLength: 256,
  paramCount: 8,
  alertKeyLength: 128,
  csrfTokenMinLength: 32,
  csrfTokenMaxLength: 256,
  versionLength: 32,
  listSize: 500,
  /** One ingest batch: 60 s of samples, plus a backlog after the gateway was down. */
  ingestSamples: 2_000,
  topProcesses: 10,
  /** The top 10 by CPU, by RSS and by IO, before de-duplication. */
  processesPerSample: 30,
  /** Per-process CPU is summed over cores: 256 cores at 100%. */
  processCpuPct: 25_600,
  cycles: 100_000,
  /** A day of 5 s pressure samples. */
  timelinePoints: 17_280,
  exportSessions: 100_000,
  pid: 4_194_304,
  idleMs: 86_400_000,
  minutesPerDay: 1_440,
  focusMinutes: 720,
  secondsPerWeek: 604_800,
  trendDays: 365,
  culpritDays: 90,
  percent: 100,
  rulePriority: 1_000,
  watts: 1_000,
  celsius: 150,
  bytes: Number.MAX_SAFE_INTEGER,
  daysPerWeek: 7,
  lastWeekday: 6,
  rangeDays: 92,
} as const;
