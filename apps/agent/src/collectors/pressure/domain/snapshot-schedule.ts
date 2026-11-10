/**
 * SPEC §4.1: besides load, the process list is taken every 5 minutes, so the
 * system service can follow memory growth on a calm machine.
 */
export const SNAPSHOT_EVERY_MS = 300_000;

/**
 * Under load, a snapshot at most every 15 s: the time `some avg10` must stay
 * above its threshold before the system service opens an incident (SPEC §5),
 * so every incident still gets its culprits. A snapshot on every 5 s tick
 * would cost this collector alone most of the agent's CPU budget (SPEC §4.4).
 */
export const SNAPSHOT_UNDER_LOAD_MS = 15_000;

/**
 * Whether this pressure tick also takes a process snapshot: on the first
 * tick, then once the interval for the current state has passed. A clock
 * that went backwards (a manual change) counts as due.
 */
export function isSnapshotDue(
  underLoad: boolean,
  nowMs: number,
  lastSnapshotMs: number | undefined,
): boolean {
  if (lastSnapshotMs === undefined) {
    return true;
  }
  const elapsed = nowMs - lastSnapshotMs;
  const interval = underLoad ? SNAPSHOT_UNDER_LOAD_MS : SNAPSHOT_EVERY_MS;
  return elapsed < 0 || elapsed >= interval;
}
