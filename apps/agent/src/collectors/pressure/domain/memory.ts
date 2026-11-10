import { z } from 'zod';

/** What the critical-memory rule needs (SPEC §5 system). */
export interface MemoryReading {
  readonly memAvailablePct: number;
  /** Some swap is in use: the system has already pushed pages out. */
  readonly swapActive: boolean;
}

/** `/proc/meminfo` values are kB; 15 digits stay inside `Number.MAX_SAFE_INTEGER`. */
const Kilobytes = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);

const Meminfo = z.object({
  MemTotal: Kilobytes.pipe(z.number().positive()),
  MemAvailable: Kilobytes,
  SwapTotal: Kilobytes,
  SwapFree: Kilobytes,
});

const MEMINFO_LINE = /^(\w+):\s+(\d+)(?: kB)?$/;
const PERCENT = 100;
/** Two decimals: finer than any threshold the system service applies. */
const PRECISION = 100;

function fields(text: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = MEMINFO_LINE.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries[match[1]] = match[2];
    }
  }
  return entries;
}

/**
 * Parses `/proc/meminfo` into available memory as a share of the total and
 * whether swap is in use. Returns `undefined` when a needed field is missing
 * or malformed (MemAvailable exists since Linux 3.14).
 */
export function parseMemoryReading(text: string): MemoryReading | undefined {
  const result = Meminfo.safeParse(fields(text));
  if (!result.success) {
    return undefined;
  }
  const { MemTotal, MemAvailable, SwapTotal, SwapFree } = result.data;
  const share = Math.min(1, MemAvailable / MemTotal);
  return {
    memAvailablePct: Math.round(share * PERCENT * PRECISION) / PRECISION,
    swapActive: SwapFree < SwapTotal,
  };
}
