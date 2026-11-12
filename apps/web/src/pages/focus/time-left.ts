const MS_PER_MINUTE = 60_000;

/** Whole minutes until `endsAt`, rounded up so the last partial minute still shows "1"; never below 0. */
export function minutesLeft(endsAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / MS_PER_MINUTE));
}
