/**
 * Pure rules for the buffer's files: naming, line splitting and the size cap
 * (SPEC §4.3). No IO, so every edge case is unit-tested directly.
 */

/** SPEC §4.3: beyond 50 MB (50 MiB) the oldest files are dropped. */
export const BUFFER_MAX_BYTES = 52_428_800;

const FILE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}\.jsonl$/;
/** `2026-11-08T21:04:05.000Z` → `2026-11-08T21`. */
const ISO_HOUR_LENGTH = 13;
const NEWLINE = 0x0a;

/** One file per UTC hour. The names sort chronologically. */
export function hourFileName(at: Date): string {
  return `${at.toISOString().slice(0, ISO_HOUR_LENGTH)}.jsonl`;
}

export function isBufferFileName(name: string): boolean {
  return FILE_PATTERN.test(name);
}

export interface FileSize {
  readonly name: string;
  readonly size: number;
}

/** The oldest files to delete so the rest fit in `maxBytes`. */
export function selectEvictions(files: readonly FileSize[], maxBytes: number): string[] {
  const oldestFirst = [...files].sort((a, b) => a.name.localeCompare(b.name));
  let total = oldestFirst.reduce((sum, file) => sum + file.size, 0);
  const evicted: string[] = [];
  for (const file of oldestFirst) {
    if (total <= maxBytes) {
      break;
    }
    evicted.push(file.name);
    total -= file.size;
  }
  return evicted;
}

export interface Line {
  readonly text: string;
  /** The byte offset just past this line, where the next one starts. */
  readonly end: number;
}

/**
 * Splits a JSONL file into lines with byte offsets, so a partly sent file can
 * be cut at an exact byte. A trailing line without a newline is a write cut
 * short by a crash; it is returned too, so the caller drops it as invalid.
 */
export function splitLines(content: Buffer): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < content.length) {
    const newline = content.indexOf(NEWLINE, start);
    const end = newline === -1 ? content.length : newline + 1;
    const stop = newline === -1 ? content.length : newline;
    lines.push({ text: content.subarray(start, stop).toString('utf8'), end });
    start = end;
  }
  return lines;
}
