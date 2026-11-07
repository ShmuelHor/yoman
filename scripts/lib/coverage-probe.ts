/** Deliberately untested, to prove that a coverage drop fails CI. Reverted before merge. */
const LOWER_BOUND = 10;
const UPPER_BOUND = 100;

export function absolute(value: number): number {
  if (value > 0) {
    return value;
  }
  return -value;
}

export function clampLow(value: number): number {
  if (value < LOWER_BOUND) {
    return LOWER_BOUND;
  }
  return value;
}

export function clampHigh(value: number): number {
  if (value > UPPER_BOUND) {
    return UPPER_BOUND;
  }
  return value;
}

export function isEven(value: number): boolean {
  const remainder = value % 2;
  return remainder === 0;
}

export function describeSign(value: number): string {
  if (value > 0) {
    return 'positive';
  }
  if (value < 0) {
    return 'negative';
  }
  return 'zero';
}
