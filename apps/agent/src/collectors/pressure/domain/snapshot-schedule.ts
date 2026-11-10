/**
 * SPEC §4.1: besides load, the process list is taken every 5 minutes, so the
 * system service can follow memory growth on a calm machine.
 */
export const SNAPSHOT_EVERY_MS = 300_000;

/**
 * Whether this pressure tick also takes a process snapshot: on every tick
 * under load, on the first tick, and once the routine interval has passed.
 * A clock that went backwards (a manual change) counts as due.
 */
export function isSnapshotDue(
  underLoad: boolean,
  nowMs: number,
  lastSnapshotMs: number | undefined,
): boolean {
  if (underLoad || lastSnapshotMs === undefined) {
    return true;
  }
  const elapsed = nowMs - lastSnapshotMs;
  return elapsed < 0 || elapsed >= SNAPSHOT_EVERY_MS;
}
