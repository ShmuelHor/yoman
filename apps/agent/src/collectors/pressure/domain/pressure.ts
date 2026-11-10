import { Percent } from '@yoman/shared/common';
import type { PressureValues } from '@yoman/shared/ingest';
import { z } from 'zod';

/** The three resources `/proc/pressure` reports on. */
export const PRESSURE_RESOURCES = ['cpu', 'memory', 'io'] as const;
export type PressureResource = (typeof PRESSURE_RESOURCES)[number];

/** Raw contents of `/proc/pressure/<resource>`; a resource the kernel lacks is `undefined`. */
export type PressureFiles = { readonly [R in PressureResource]?: string | undefined };

export type PressureReading = { readonly [R in PressureResource]: PressureValues };

/** The kernel prints `avg10` with exactly two decimals, as a percentage of wall time. */
const Avg10 = z
  .string()
  .regex(/^\d{1,3}\.\d{2}$/)
  .transform(Number)
  .pipe(Percent);

const AVG10_LINE = /^(some|full) avg10=(\S+) /;

function avg10(lines: readonly string[], kind: 'some' | 'full'): number | undefined {
  for (const line of lines) {
    const match = AVG10_LINE.exec(line);
    if (match?.[1] === kind) {
      const result = Avg10.safeParse(match[2]);
      return result.success ? result.data : undefined;
    }
  }
  return undefined;
}

/**
 * Parses one `/proc/pressure/<resource>` file into its `some` and `full`
 * `avg10` values. Kernels before 5.13 print no `full` line for cpu, which
 * means no task was ever fully stalled on it, so it reads as 0. Returns
 * `undefined` when `some` is missing or malformed.
 */
export function parsePressureValues(text: string): PressureValues | undefined {
  const lines = text.split('\n');
  const some = avg10(lines, 'some');
  if (some === undefined) {
    return undefined;
  }
  const hasFull = lines.some((line) => line.startsWith('full '));
  const full = hasFull ? avg10(lines, 'full') : 0;
  if (full === undefined) {
    return undefined;
  }
  return { some, full };
}

/** Parses all three resources; `undefined` unless every one is readable. */
export function parsePressureReading(files: PressureFiles): PressureReading | undefined {
  const cpu = files.cpu === undefined ? undefined : parsePressureValues(files.cpu);
  const memory = files.memory === undefined ? undefined : parsePressureValues(files.memory);
  const io = files.io === undefined ? undefined : parsePressureValues(files.io);
  if (cpu === undefined || memory === undefined || io === undefined) {
    return undefined;
  }
  return { cpu, memory, io };
}
