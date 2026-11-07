/**
 * Lists the security tests (SECURITY.md section 3) that are still `it.todo`,
 * grouped by the task that owns them.
 *
 * Usage: npm run security:todo [-- --strict]
 *
 * Without --strict it exits 0 while tests are open, so it can be read during
 * development. With --strict any open test fails the run, which is how a
 * release proves nothing was forgotten. A malformed test file always fails.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { formatReport, type SecurityTestSource, scanSecurityTests } from './lib/security-todo.js';

const TESTS_DIR = fileURLToPath(new URL('../tests/security', import.meta.url));
const TEST_FILE = /\.test\.ts$/u;

/**
 * `npm run security:todo --strict` (without `--`) hands the flag to npm, which
 * exposes it as npm_config_strict instead of passing it on, so read both.
 */
const NpmEnv = z.object({ npm_config_strict: z.string().optional() });
const strict =
  process.argv.slice(2).includes('--strict') ||
  NpmEnv.parse(process.env).npm_config_strict === 'true';

async function readTestFiles(): Promise<readonly SecurityTestSource[]> {
  const entries = await readdir(TESTS_DIR, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && TEST_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (fileName) => ({
      fileName,
      source: await readFile(join(TESTS_DIR, fileName), 'utf8'),
    })),
  );
}

const { open, errors } = scanSecurityTests(await readTestFiles());

process.stdout.write(formatReport(open));

if (errors.length > 0) {
  process.stderr.write(
    `\nThe security tests cannot be counted reliably:\n${errors.map((error) => `  ${error}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else if (strict && open.length > 0) {
  process.stderr.write('\n--strict: every security test must be active.\n');
  process.exitCode = 1;
}
