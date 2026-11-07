import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

const run = promisify(execFile);

/** git's `-z` output: NUL-separated paths. */
const GitPathList = z.string().transform((stdout) => stdout.split('\0').filter((p) => p !== ''));

/**
 * Lists the staged files that would end up in the commit. Deletions are left
 * out (`--diff-filter=d`), so removing a committed `.env` is never blocked.
 *
 * @param cwd the repository to inspect
 */
export async function listStagedFiles(cwd: string): Promise<readonly string[]> {
  const { stdout } = await run(
    'git',
    ['diff', '--cached', '--name-only', '-z', '--diff-filter=d', '--no-renames'],
    { cwd },
  );
  return GitPathList.parse(stdout);
}
