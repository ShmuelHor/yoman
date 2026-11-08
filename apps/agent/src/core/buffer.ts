import { readdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Sample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import {
  BUFFER_MAX_BYTES,
  hourFileName,
  isBufferFileName,
  selectEvictions,
  splitLines,
} from './buffer-files.js';
import type { AgentLogger } from './logger.js';
import {
  appendPrivateFile,
  ensurePrivateDir,
  ensurePrivateFile,
  writePrivateFileAtomic,
} from './private-fs.js';

export interface BufferOptions {
  /** `~/.local/state/yoman`, forced to `0700` together with the buffer directory. */
  readonly stateDir: string;
  /** `~/.local/state/yoman/buffer`. */
  readonly bufferDir: string;
  readonly logger: Pick<AgentLogger, 'warn'>;
  readonly maxBytes?: number;
  readonly now?: () => Date;
}

/** How far a batch read into one file: acking it removes exactly these bytes. */
export interface BufferCursor {
  readonly file: string;
  readonly end: number;
  /** Which incarnation of the file was read, so a recreated file is never cut. */
  readonly generation: number;
}

export interface BufferBatch {
  readonly samples: readonly Sample[];
  readonly cursors: readonly BufferCursor[];
}

export interface SampleBuffer {
  /** Validates and appends samples to the current hour's file, then enforces the cap. */
  append(samples: readonly Sample[]): Promise<void>;
  /** The oldest samples, at most `maxSamples` (one ingest batch by default). */
  read(maxSamples?: number): Promise<BufferBatch>;
  /** Removes what `read` returned, after the gateway accepted it (SPEC §4.3). */
  ack(batch: BufferBatch): Promise<void>;
  /** Deletes every buffered sample. */
  clear(): Promise<void>;
  /** The bytes currently buffered. */
  readonly sizeBytes: number;
}

interface FileEntry {
  size: number;
  readonly generation: number;
}

const TEMP_SUFFIX = '.tmp';

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error: unknown) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

/** Validation errors name the field paths only: a sample's values may include a window title. */
function describeIssues(error: { issues: readonly { path: readonly PropertyKey[] }[] }): string {
  return [...new Set(error.issues.map((issue) => issue.path.map(String).join('.')))].join(', ');
}

function parseLine(text: string): Sample | undefined {
  try {
    const result = Sample.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The agent's local JSONL buffer (SPEC §4.3). Operations run one at a time,
 * so the in-memory size index always matches the files on disk.
 */
export async function createBuffer(options: BufferOptions): Promise<SampleBuffer> {
  const { bufferDir, logger } = options;
  const maxBytes = options.maxBytes ?? BUFFER_MAX_BYTES;
  const now = options.now ?? ((): Date => new Date());
  const files = new Map<string, FileEntry>();
  let nextGeneration = 0;
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  function track(name: string, size: number): void {
    files.set(name, { size, generation: nextGeneration });
    nextGeneration += 1;
  }

  async function remove(name: string): Promise<void> {
    await unlinkIfPresent(join(bufferDir, name));
    files.delete(name);
  }

  async function enforceCap(): Promise<void> {
    const sizes = [...files].map(([name, entry]) => ({ name, size: entry.size }));
    for (const name of selectEvictions(sizes, maxBytes)) {
      const bytes = files.get(name)?.size ?? 0;
      await remove(name);
      logger.warn({ file: name, bytes, maxBytes }, 'buffer over its cap: dropped the oldest file');
    }
  }

  async function readFileBatch(
    name: string,
    entry: FileEntry,
    limit: number,
    into: Sample[],
  ): Promise<BufferCursor | undefined> {
    const content = await readFile(join(bufferDir, name));
    let end = 0;
    let skipped = 0;
    for (const line of splitLines(content)) {
      if (into.length >= limit) {
        break;
      }
      const sample = parseLine(line.text);
      if (sample === undefined) {
        skipped += 1;
      } else {
        into.push(sample);
      }
      end = line.end;
    }
    if (skipped > 0) {
      logger.warn({ file: name, skipped }, 'buffer skipped invalid lines');
    }
    // An empty file (a crash before the first write) gets a cursor too, so ack removes it.
    const consumed = end > 0 || content.length === 0;
    return consumed ? { file: name, end, generation: entry.generation } : undefined;
  }

  async function ackCursor(cursor: BufferCursor): Promise<void> {
    const entry = files.get(cursor.file);
    if (entry === undefined || entry.generation !== cursor.generation) {
      return;
    }
    if (entry.size <= cursor.end) {
      await remove(cursor.file);
      return;
    }
    // The file grew after the read: keep only the samples appended since.
    const path = join(bufferDir, cursor.file);
    const rest = (await readFile(path)).subarray(cursor.end);
    await writePrivateFileAtomic(path, rest);
    entry.size = rest.length;
  }

  await ensurePrivateDir(options.stateDir);
  await ensurePrivateDir(bufferDir);
  for (const name of (await readdir(bufferDir)).sort()) {
    const path = join(bufferDir, name);
    if (name.endsWith(TEMP_SUFFIX)) {
      // Left behind by a crash during an ack; the original file is still intact.
      await rm(path, { force: true });
    } else if (isBufferFileName(name)) {
      await ensurePrivateFile(path);
      track(name, (await stat(path)).size);
    }
  }
  await enforceCap();

  return {
    append: (samples) =>
      exclusive(async () => {
        const lines: string[] = [];
        for (const candidate of samples) {
          const result = Sample.safeParse(candidate);
          if (!result.success) {
            throw new Error(`invalid sample at: ${describeIssues(result.error)}`);
          }
          lines.push(`${JSON.stringify(result.data)}\n`);
        }
        if (lines.length === 0) {
          return;
        }
        const name = hourFileName(now());
        const data = lines.join('');
        await appendPrivateFile(join(bufferDir, name), data);
        const entry = files.get(name);
        if (entry === undefined) {
          track(name, Buffer.byteLength(data));
        } else {
          entry.size += Buffer.byteLength(data);
        }
        await enforceCap();
      }),

    read: (maxSamples = LIMITS.ingestSamples) =>
      exclusive(async () => {
        const samples: Sample[] = [];
        const cursors: BufferCursor[] = [];
        for (const name of [...files.keys()].sort()) {
          const entry = files.get(name);
          if (samples.length >= maxSamples || entry === undefined) {
            break;
          }
          const cursor = await readFileBatch(name, entry, maxSamples, samples);
          if (cursor !== undefined) {
            cursors.push(cursor);
          }
        }
        return { samples, cursors };
      }),

    ack: (batch) =>
      exclusive(async () => {
        for (const cursor of batch.cursors) {
          await ackCursor(cursor);
        }
      }),

    clear: () =>
      exclusive(async () => {
        for (const name of [...files.keys()]) {
          await remove(name);
        }
      }),

    get sizeBytes(): number {
      let total = 0;
      for (const entry of files.values()) {
        total += entry.size;
      }
      return total;
    },
  };
}
