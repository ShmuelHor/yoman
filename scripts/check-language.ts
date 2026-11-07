/**
 * Fails when Hebrew appears outside translation files and planning docs.
 * Runs as part of `npm run check` and in CI.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { findHebrew, formatViolation, shouldScan, type Violation } from './lib/language-policy.js';

const run = promisify(execFile);

async function listRepoFiles(): Promise<string[]> {
  const { stdout } = await run('git', [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  return stdout.split('\0').filter((path) => path.length > 0);
}

async function scan(path: string): Promise<Violation[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from git ls-files
  const content = await readFile(path, 'utf8').catch(() => '');
  return findHebrew(path, content);
}

const files = (await listRepoFiles()).filter(shouldScan);
const violations = (await Promise.all(files.map(scan))).flat();

if (violations.length > 0) {
  process.stderr.write(
    `Hebrew found outside translation files (see CLAUDE.md > Language):\n${violations
      .map(formatViolation)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Language check passed (${String(files.length)} files).\n`);
}
