import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendPrivateFile,
  ensurePrivateDir,
  ensurePrivateFile,
  modeOf,
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE,
  writePrivateFileAtomic,
} from '../../src/core/private-fs.js';

const OPEN_MODE = 0o755;
const OPEN_FILE_MODE = 0o644;

describe('private-fs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-private-fs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates nested directories at 0700', async () => {
    const dir = join(root, 'a', 'b');
    await ensurePrivateDir(dir);
    expect(await modeOf(dir)).toBe(PRIVATE_DIR_MODE);
  });

  it('tightens an existing directory to 0700', async () => {
    const dir = join(root, 'open');
    await mkdir(dir, { mode: OPEN_MODE });
    await ensurePrivateDir(dir);
    expect(await modeOf(dir)).toBe(PRIVATE_DIR_MODE);
  });

  it('appends to a new file at 0600 and keeps earlier content', async () => {
    const file = join(root, 'log.jsonl');
    await appendPrivateFile(file, 'a\n');
    await appendPrivateFile(file, 'b\n');
    expect(await readFile(file, 'utf8')).toBe('a\nb\n');
    expect(await modeOf(file)).toBe(PRIVATE_FILE_MODE);
  });

  it('tightens an existing file on append and on demand', async () => {
    const appended = join(root, 'appended');
    const fixed = join(root, 'fixed');
    await writeFile(appended, '', { mode: OPEN_FILE_MODE });
    await writeFile(fixed, '', { mode: OPEN_FILE_MODE });
    await appendPrivateFile(appended, 'x');
    await ensurePrivateFile(fixed);
    expect(await modeOf(appended)).toBe(PRIVATE_FILE_MODE);
    expect(await modeOf(fixed)).toBe(PRIVATE_FILE_MODE);
  });

  it('replaces a file atomically at 0600', async () => {
    const file = join(root, 'state.json');
    await writeFile(file, 'old', { mode: OPEN_FILE_MODE });
    await writePrivateFileAtomic(file, 'new');
    expect(await readFile(file, 'utf8')).toBe('new');
    expect(await modeOf(file)).toBe(PRIVATE_FILE_MODE);
  });
});
