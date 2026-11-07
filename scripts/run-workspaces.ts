/**
 * Runs an npm script in every workspace that defines it.
 *
 * `npm run <script> --workspaces` fails when no workspace exists yet, which
 * is the normal state early on. This wrapper treats "no workspaces" as success.
 *
 * Usage: tsx scripts/run-workspaces.ts <script>
 */
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { z } from 'zod';

import { type ChildExit, toExitOutcome } from './lib/child-exit.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

/** The fields of a Node.js system error that we report. */
const SystemError = z.object({ code: z.string().optional(), message: z.string() });

/** Shape of `npm query .workspace --json`, limited to the fields we use. */
const WorkspaceList = z.array(z.object({ location: z.string().min(1) }));

async function listWorkspaces(): Promise<string[]> {
  const { stdout } = await promisify(execFile)('npm', ['query', '.workspace', '--json'], {
    cwd: ROOT,
  });
  return WorkspaceList.parse(JSON.parse(stdout)).map((workspace) => workspace.location);
}

/** Runs npm with inherited stdio, so output streams live with its colors intact. */
function runNpm(args: readonly string[]): Promise<ChildExit> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

async function main(script: string): Promise<number> {
  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) {
    process.stdout.write(`No workspaces yet, skipping "${script}".\n`);
    return 0;
  }

  const args = ['run', script, '--if-present', ...workspaces.flatMap((dir) => ['-w', dir])];
  let exit: ChildExit;
  try {
    exit = await runNpm(args);
  } catch (error: unknown) {
    // Spawning itself failed (npm not on PATH, for example), so npm printed nothing.
    const { message } = SystemError.parse(error);
    process.stderr.write(`Could not run npm: ${message}\n`);
    return EXIT_FAILURE;
  }

  const outcome = toExitOutcome('npm', exit);
  if (outcome.message !== undefined) {
    process.stderr.write(`${outcome.message}\n`);
  }
  return outcome.exitCode;
}

const script = process.argv[2];
if (script === undefined) {
  process.stderr.write('Usage: tsx scripts/run-workspaces.ts <script>\n');
  process.exit(EXIT_USAGE);
}

process.exitCode = await main(script);
