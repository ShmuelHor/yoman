/**
 * Runs an npm script in every workspace that defines it.
 *
 * `npm run <script> --workspaces` fails when no workspace exists yet, which
 * is the normal state early on. This wrapper treats "no workspaces" as success.
 *
 * Usage: tsx scripts/run-workspaces.ts <script>
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

const run = promisify(execFile);

/** Shape of `npm query .workspace --json`, limited to the fields we use. */
const WorkspaceList = z.array(z.object({ location: z.string().min(1) }));

/** Output that `execFile` attaches to the error when the child exits non-zero. */
const ChildFailure = z.object({
  stdout: z.string().default(''),
  stderr: z.string().default(''),
});

async function listWorkspaces(): Promise<string[]> {
  const { stdout } = await run('npm', ['query', '.workspace', '--json']);
  return WorkspaceList.parse(JSON.parse(stdout)).map((workspace) => workspace.location);
}

async function runInWorkspaces(script: string, workspaces: readonly string[]): Promise<boolean> {
  const args = ['run', script, '--if-present', ...workspaces.flatMap((dir) => ['-w', dir])];
  try {
    const { stdout, stderr } = await run('npm', args);
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    return true;
  } catch (error: unknown) {
    const { stdout, stderr } = ChildFailure.parse(error);
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    return false;
  }
}

const script = process.argv[2];
if (script === undefined) {
  process.stderr.write('Usage: tsx scripts/run-workspaces.ts <script>\n');
  process.exit(2);
}

const workspaces = await listWorkspaces();
if (workspaces.length === 0) {
  process.stdout.write(`No workspaces yet, skipping "${script}".\n`);
} else if (!(await runInWorkspaces(script, workspaces))) {
  process.exitCode = 1;
}
