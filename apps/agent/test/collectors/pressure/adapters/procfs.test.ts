import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listPids,
  MAX_PROC_FILE_BYTES,
  readPressureFiles,
  readProcessFile,
  readProcFile,
} from '../../../../src/collectors/pressure/adapters/procfs.js';

describe('procfs adapter', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-procfs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a file whole', async () => {
    // Arrange
    await writeFile(join(root, 'uptime'), '12.34 56.78\n');

    // Act / Assert
    expect(readProcFile(join(root, 'uptime'))).toBe('12.34 56.78\n');
  });

  it('cuts a file off at the size limit', async () => {
    // Arrange
    await writeFile(join(root, 'huge'), 'x'.repeat(MAX_PROC_FILE_BYTES * 2));

    // Act / Assert
    expect(readProcFile(join(root, 'huge'))).toHaveLength(MAX_PROC_FILE_BYTES);
  });

  it('reads a missing file as absent, as when a process exits mid-scan', () => {
    // Act / Assert
    expect(readProcFile(join(root, 'no-such-file'))).toBeUndefined();
  });

  it('fails loudly on an unexpected error rather than hiding it', async () => {
    // Arrange
    await mkdir(join(root, 'a-directory'));

    // Act / Assert
    expect(() => readProcFile(join(root, 'a-directory'))).toThrow(/EISDIR/);
  });

  it('lists only numeric process directories', async () => {
    // Arrange
    await Promise.all(
      ['1', '42', 'self', 'pressure', '0', '007', '12345678'].map((name) =>
        mkdir(join(root, name)),
      ),
    );

    // Act / Assert
    expect(listPids(root).sort((a, b) => a - b)).toEqual(['1', '42'].map(Number));
  });

  it('reads no pressure files on a kernel without PSI', () => {
    // Act / Assert
    expect(readPressureFiles(root)).toEqual({ cpu: undefined, memory: undefined, io: undefined });
  });

  it('reads a per-process file by name', async () => {
    // Arrange
    await mkdir(join(root, '42'));
    await writeFile(join(root, '42', 'stat'), '42 (node) S\n');

    // Act / Assert
    expect(readProcessFile(root, Number('42'), 'stat')).toBe('42 (node) S\n');
  });
});
