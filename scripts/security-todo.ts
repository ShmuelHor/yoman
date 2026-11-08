/**
 * Lists the security tests (SECURITY.md section 3) that are still `it.todo`,
 * grouped by the task that owns them, plus any test that is skipped, failing
 * or declared with `.fails`.
 *
 * Usage: npm run security:todo [-- --strict]
 *
 * It runs the suite with Vitest's JSON reporter and reads the result. Without
 * --strict it exits 0 while tests are only todo, so it can be read during
 * development. With --strict, the release gate, any todo, skipped or `.fails`
 * test fails the run. A failing test or an untrustworthy suite always fails.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSecurityTodo } from './lib/security-todo-cli.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SUITE_DIR = join(ROOT, 'tests', 'security');
const VITEST_CLI = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
/** 16 MiB of console output from the suite is far more than it prints. */
const MAX_OUTPUT_BYTES = 16_777_216;

/**
 * Runs the suite and returns the parsed report. Vitest exits non-zero when a
 * test fails, which is reported from the JSON itself, so only a missing
 * report is an error here.
 */
async function runSuite(): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), 'yoman-security-'));
  const outputFile = join(dir, 'report.json');
  try {
    const stderr = await new Promise<string>((resolve) => {
      execFile(
        process.execPath,
        [
          VITEST_CLI,
          'run',
          '--config',
          'vitest.security.config.ts',
          '--reporter=json',
          `--outputFile=${outputFile}`,
        ],
        { cwd: ROOT, maxBuffer: MAX_OUTPUT_BYTES },
        (_error, _stdout, output) => {
          resolve(output);
        },
      );
    });
    const text = await readFile(outputFile, 'utf8').catch((error: unknown) => {
      throw new Error(`Vitest wrote no JSON report.\n${stderr}`, { cause: error });
    });
    const report: unknown = JSON.parse(text);
    return report;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

process.exitCode = await runSecurityTodo({
  argv: process.argv.slice(2),
  env: process.env,
  suiteDir: SUITE_DIR,
  runSuite,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
