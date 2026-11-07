/** Deliberately untested, to prove that a coverage drop fails CI. Reverted in the next commit. */
export function coverageProbe(value: number): number {
  if (value > 0) {
    return value;
  }
  return -value;
}
