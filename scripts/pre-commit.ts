/**
 * The git pre-commit hook (installed by simple-git-hooks).
 * Blocks staged env files and scans staged changes with gitleaks when it is installed.
 *
 * Usage: tsx scripts/pre-commit.ts
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import type { ChildExit } from './lib/child-exit.js';
import { runPreCommit } from './lib/pre-commit.js';
import { listStagedFiles } from './lib/staged-files.js';

const run = promisify(execFile);

/** The fields of a Node.js system error that we inspect. */
const SystemError = z.object({ code: z.string().optional() });

async function gitleaksVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await run('gitleaks', ['version']);
    return z.string().parse(stdout).trim();
  } catch (error: unknown) {
    if (SystemError.safeParse(error).data?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function runGitleaks(args: readonly string[]): Promise<ChildExit> {
  return new Promise((resolve, reject) => {
    const child = spawn('gitleaks', args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

process.exitCode = await runPreCommit({
  listStagedFiles: () => listStagedFiles(process.cwd()),
  gitleaksVersion,
  runGitleaks,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
