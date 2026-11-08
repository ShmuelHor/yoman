import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createBuffer, type SampleBuffer } from '../../src/core/buffer.js';
import type { AgentLogger } from '../../src/core/logger.js';
import { modeOf, PRIVATE_DIR_MODE, PRIVATE_FILE_MODE } from '../../src/core/private-fs.js';

const HOUR_ONE = new Date('2026-11-08T09:15:00Z');
const HOUR_TWO = new Date('2026-11-08T10:15:00Z');
const HOUR_THREE = new Date('2026-11-08T11:15:00Z');
const OPEN_FILE_MODE = 0o644;
const BATCH = 3;

function sample(pid: number, title?: string): Sample {
  return {
    kind: 'window',
    ts: '2026-11-08T09:15:00Z',
    wmClass: 'firefox',
    pid,
    idleMs: 0,
    locked: false,
    ...(title === undefined ? {} : { title }),
  };
}

const PID_A = 1001;
const PID_B = 1002;
const PID_C = 1003;
const PID_D = 1004;
const A = sample(PID_A);
const B = sample(PID_B);
const C = sample(PID_C);
const D = sample(PID_D);

const lineBytes = (s: Sample): number => Buffer.byteLength(`${JSON.stringify(s)}\n`);

describe('createBuffer', () => {
  let root: string;
  let stateDir: string;
  let bufferDir: string;
  let clock: Date;
  let warn: Mock<AgentLogger['warn']>;

  async function open(maxBytes?: number): Promise<SampleBuffer> {
    return createBuffer({
      stateDir,
      bufferDir,
      logger: { warn },
      now: () => clock,
      ...(maxBytes === undefined ? {} : { maxBytes }),
    });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-buffer-'));
    stateDir = join(root, 'state', 'yoman');
    bufferDir = join(stateDir, 'buffer');
    clock = HOUR_ONE;
    warn = vi.fn<AgentLogger['warn']>();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates its directories at 0700 and its files at 0600', async () => {
    const buffer = await open();
    await buffer.append([A]);
    expect(await modeOf(stateDir)).toBe(PRIVATE_DIR_MODE);
    expect(await modeOf(bufferDir)).toBe(PRIVATE_DIR_MODE);
    expect(await modeOf(join(bufferDir, '2026-11-08T09.jsonl'))).toBe(PRIVATE_FILE_MODE);
  });

  it('writes one JSONL file per hour', async () => {
    const buffer = await open();
    await buffer.append([A, B]);
    clock = HOUR_TWO;
    await buffer.append([C]);
    expect((await readdir(bufferDir)).sort()).toEqual([
      '2026-11-08T09.jsonl',
      '2026-11-08T10.jsonl',
    ]);
    const first = await readFile(join(bufferDir, '2026-11-08T09.jsonl'), 'utf8');
    expect(
      first
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([A, B]);
  });

  it('reads the oldest samples first, up to the limit', async () => {
    const buffer = await open();
    await buffer.append([A, B]);
    clock = HOUR_TWO;
    await buffer.append([C, D]);
    const batch = await buffer.read(BATCH);
    expect(batch.samples.map((s) => s.kind === 'window' && s.pid)).toEqual([PID_A, PID_B, PID_C]);
    expect(batch.cursors.map((c) => c.file)).toEqual([
      '2026-11-08T09.jsonl',
      '2026-11-08T10.jsonl',
    ]);
  });

  it('deletes fully acked files and keeps the rest', async () => {
    const buffer = await open();
    await buffer.append([A, B]);
    clock = HOUR_TWO;
    await buffer.append([C, D]);
    await buffer.ack(await buffer.read(BATCH));
    expect(await readdir(bufferDir)).toEqual(['2026-11-08T10.jsonl']);
    const rest = await buffer.read();
    expect(rest.samples).toEqual([D]);
    expect(buffer.sizeBytes).toBe(lineBytes(D));
    expect(await modeOf(join(bufferDir, '2026-11-08T10.jsonl'))).toBe(PRIVATE_FILE_MODE);
  });

  it('keeps samples appended between read and ack', async () => {
    const buffer = await open();
    await buffer.append([A]);
    const batch = await buffer.read();
    await buffer.append([B]);
    await buffer.ack(batch);
    expect((await buffer.read()).samples).toEqual([B]);
  });

  it('ignores an ack for a file that was recreated since the read', async () => {
    const buffer = await open();
    await buffer.append([A]);
    const stale = await buffer.read();
    await buffer.clear();
    await buffer.append([B, C]);
    await buffer.ack(stale);
    expect((await buffer.read()).samples).toEqual([B, C]);
  });

  it('returns an empty batch when nothing is buffered', async () => {
    const buffer = await open();
    expect(await buffer.read()).toEqual({ samples: [], cursors: [] });
  });

  it('rejects invalid samples without echoing their values', async () => {
    const buffer = await open();
    const secret = 'Private Title';
    const bad = { ...sample(PID_A, secret), pid: -1 } as Sample;
    const error: unknown = await buffer.append([bad]).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('invalid sample at: pid');
    await buffer.append([]);
    expect(await readdir(bufferDir)).toEqual([]);
  });

  it('drops the oldest files beyond the cap, with a warning', async () => {
    const one = lineBytes(A);
    const buffer = await open(one * 2);
    await buffer.append([A]);
    clock = HOUR_TWO;
    await buffer.append([B]);
    clock = HOUR_THREE;
    await buffer.append([C]);
    expect((await buffer.read()).samples).toEqual([B, C]);
    expect(warn).toHaveBeenCalledWith(
      { file: '2026-11-08T09.jsonl', bytes: one, maxBytes: one * 2 },
      expect.any(String),
    );
  });

  it('recovers files from an earlier run: tightens modes, skips bad lines, drops temp files', async () => {
    await mkdir(bufferDir, { recursive: true });
    const old = join(bufferDir, '2026-11-08T08.jsonl');
    await writeFile(old, `${JSON.stringify(A)}\nnot json\n{"kind":"window"}\n`, {
      mode: OPEN_FILE_MODE,
    });
    await appendFile(old, '{"kind":"win');
    await writeFile(join(bufferDir, '2026-11-08T07.jsonl'), '');
    await writeFile(join(bufferDir, '2026-11-08T08.jsonl.tmp'), 'half');
    await writeFile(join(bufferDir, 'README'), 'not ours');

    const buffer = await open();
    expect(await modeOf(old)).toBe(PRIVATE_FILE_MODE);
    const batch = await buffer.read();
    expect(batch.samples).toEqual([A]);
    expect(warn).toHaveBeenCalledWith(
      { file: '2026-11-08T08.jsonl', skipped: BATCH },
      expect.any(String),
    );
    await buffer.ack(batch);
    expect(await readdir(bufferDir)).toEqual(['README']);
    expect(buffer.sizeBytes).toBe(0);
  });

  it('enforces the cap on startup', async () => {
    const first = await open();
    await first.append([A]);
    clock = HOUR_TWO;
    await first.append([B]);
    const second = await open(lineBytes(B));
    expect((await second.read()).samples).toEqual([B]);
  });

  it('keeps working after a failed operation', async () => {
    const buffer = await open();
    await expect(buffer.append([{ kind: 'nope' } as unknown as Sample])).rejects.toThrow();
    await buffer.append([A]);
    expect((await buffer.read()).samples).toEqual([A]);
  });

  it('surfaces filesystem errors other than a missing file', async () => {
    const buffer = await open();
    await buffer.append([A]);
    const batch = await buffer.read();
    await buffer.append([B]);
    await rm(join(bufferDir, '2026-11-08T09.jsonl'));
    await expect(buffer.ack(batch)).rejects.toThrow();
  });
});
