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
import { detectGitleaksSyntax, type GitleaksSyntax } from './lib/commit-guard.js';
import { runPreCommit } from './lib/pre-commit.js';
import { listStagedFiles } from './lib/staged-files.js';

const run = promisify(execFile);

/** The fields of a failed `execFile` that we inspect. */
const ExecError = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

/** Probes `gitleaks git --help`; `undefined` means gitleaks is not on `PATH`. */
async function detectGitleaks(): Promise<GitleaksSyntax | undefined> {
  try {
    const { stdout, stderr } = await run('gitleaks', ['git', '--help']);
    return detectGitleaksSyntax({ succeeded: true, output: `${stdout}${stderr}` });
  } catch (error: unknown) {
    const { code, stdout = '', stderr = '' } = ExecError.parse(error);
    if (code === 'ENOENT') {
      return undefined;
    }
    return detectGitleaksSyntax({ succeeded: false, output: `${stdout}${stderr}` });
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
  detectGitleaks,
  runGitleaks,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
