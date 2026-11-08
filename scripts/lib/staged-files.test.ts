import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listStagedFiles } from './staged-files.js';

const run = promisify(execFile);

let repo: string;

async function git(...args: string[]): Promise<void> {
  await run(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    {
      cwd: repo,
    },
  );
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'yoman-staged-'));
  await git('init', '-q');
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('listStagedFiles', () => {
  it('lists added and modified files, including force-added ignored ones', async () => {
    await writeFile(join(repo, '.gitignore'), '.env\n');
    await writeFile(join(repo, 'a file.txt'), 'a');
    await writeFile(join(repo, '.env'), 'X=1');
    await git('add', '.gitignore', 'a file.txt');
    await git('add', '--force', '.env');

    await expect(listStagedFiles(repo)).resolves.toEqual(['.env', '.gitignore', 'a file.txt']);
  });

  it('leaves out deletions, so removing a committed .env is allowed', async () => {
    await writeFile(join(repo, '.env'), 'X=1');
    await git('add', '.env');
    await git('commit', '-q', '--no-verify', '-m', 'seed');
    await git('rm', '-q', '--cached', '.env');

    await expect(listStagedFiles(repo)).resolves.toEqual([]);
  });

  it('lists the new name of a renamed file', async () => {
    await writeFile(join(repo, 'notes.txt'), 'X=1');
    await git('add', 'notes.txt');
    await git('commit', '-q', '--no-verify', '-m', 'seed');
    await git('mv', 'notes.txt', '.env.local');

    await expect(listStagedFiles(repo)).resolves.toEqual(['.env.local']);
  });
});
