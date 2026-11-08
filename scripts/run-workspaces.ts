/**
 * Runs an npm script in every workspace that defines it.
 *
 * `npm run <script> --workspaces` fails when no workspace exists yet, which
 * is the normal state early on. This wrapper treats "no workspaces" as success.
 *
 * Workspaces are resolved from the `workspaces` globs in `package.json` on
 * disk, not from npm's installed tree, so a package added since the last
 * `npm install` is never skipped silently: npm fails on it instead.
 *
 * Usage: tsx scripts/run-workspaces.ts <script>
 */
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ChildExit, toExitOutcome } from './lib/child-exit.js';
import { parseSystemError } from './lib/system-error.js';
import { RootManifest, resolveWorkspaces, type WorkspaceFileSystem } from './lib/workspaces.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

function isMissing(error: unknown): boolean {
  return parseSystemError(error).code === 'ENOENT';
}

const diskFileSystem: WorkspaceFileSystem = {
  async listSubdirectories(dir): Promise<readonly string[]> {
    try {
      const entries = await readdir(join(ROOT, dir), { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error: unknown) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }
  },
  async isFile(path): Promise<boolean> {
    try {
      return (await stat(join(ROOT, path))).isFile();
    } catch (error: unknown) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  },
};

async function readManifest(): Promise<RootManifest> {
  const text = await readFile(join(ROOT, 'package.json'), 'utf8');
  return RootManifest.parse(JSON.parse(text));
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
  const { workspaces: globs } = await readManifest();
  const workspaces = await resolveWorkspaces(globs, diskFileSystem);
  if (workspaces.length === 0) {
    process.stdout.write(`No workspaces yet, skipping "${script}".\n`);
    return EXIT_SUCCESS;
  }

  const args = ['run', script, '--if-present', ...workspaces.flatMap((dir) => ['-w', dir])];
  let exit: ChildExit;
  try {
    exit = await runNpm(args);
  } catch (error: unknown) {
    // Spawning itself failed (npm not on PATH, for example), so npm printed nothing.
    const { message } = parseSystemError(error);
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
