/**
 * Fails when Hebrew appears outside translation files and planning docs.
 * Runs as part of `npm run check` and in CI.
 *
 * The check fails closed: a file that cannot be read is reported and fails
 * the run, because an unread file could hide a violation.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { z } from 'zod';

import {
  findHebrew,
  formatViolation,
  isBinary,
  shouldScan,
  type Violation,
} from './lib/language-policy.js';

const run = promisify(execFile);

/** The fields of a Node.js file system error that we report. */
const FsError = z.object({ code: z.string().optional(), message: z.string() });

/** Result of scanning one file: its violations, or why it could not be read. */
type ScanResult =
  | { readonly kind: 'scanned'; readonly violations: readonly Violation[] }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'unreadable'; readonly path: string; readonly reason: string };

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

async function scan(path: string): Promise<ScanResult> {
  try {
    const content = await readFile(path);
    if (isBinary(content)) {
      return { kind: 'skipped' };
    }
    return { kind: 'scanned', violations: findHebrew(path, content.toString('utf8')) };
  } catch (error: unknown) {
    const { code, message } = FsError.parse(error);
    // A tracked file deleted in the working tree has nothing left to scan.
    if (code === 'ENOENT') {
      return { kind: 'skipped' };
    }
    return { kind: 'unreadable', path, reason: message };
  }
}

const files = (await listRepoFiles()).filter(shouldScan);
const results = await Promise.all(files.map(scan));
const violations = results.flatMap((result) =>
  result.kind === 'scanned' ? result.violations : [],
);
const unreadable = results.flatMap((result) => (result.kind === 'unreadable' ? [result] : []));

if (unreadable.length > 0) {
  process.stderr.write(
    `Could not read ${String(unreadable.length)} file(s), so the language check cannot pass:\n${unreadable
      .map(({ path, reason }) => `${path}  ${reason}`)
      .join('\n')}\n`,
  );
}

if (violations.length > 0) {
  process.stderr.write(
    `Hebrew found outside translation files (see CLAUDE.md > Language):\n${violations
      .map(formatViolation)
      .join('\n')}\n`,
  );
}

if (unreadable.length > 0 || violations.length > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(`Language check passed (${String(files.length)} files).\n`);
}
