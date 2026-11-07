import { randomBytes } from 'node:crypto';
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { z } from 'zod';

import { planEnv, SECRET_BYTES, type SecretGenerator } from './env-secrets.js';

/** SECURITY §5: `.env` is readable and writable by its owner only. */
export const ENV_FILE_MODE = 0o600;
const PERMISSION_BITS = 0o777;
/** Random suffix for the temporary file, so a stale one never blocks a run. */
const TEMP_SUFFIX_BYTES = 8;

/** The fields of a Node.js file system error that we inspect. */
const FsError = z.object({ code: z.string().optional() });

/** A fresh secret: {@link SECRET_BYTES} bytes from the OS CSPRNG, as base64url. */
export const generateSecret: SecretGenerator = () =>
  randomBytes(SECRET_BYTES).toString('base64url');

/** What {@link ensureEnvFile} did. Holds key names only, never values. */
export interface EnvFileResult {
  readonly created: boolean;
  readonly added: readonly string[];
  /** Whether the mode of an existing file had to be tightened to {@link ENV_FILE_MODE}. */
  readonly fixedMode: boolean;
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (FsError.safeParse(error).data?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Writes through a temporary file in the same directory and renames it into
 * place, so `.env` is never left half written and never exists with a wider mode.
 * The name stays `.env.*`, so a leftover from a crash is still git-ignored.
 */
async function writeAtomically(path: string, content: string): Promise<void> {
  const temporary = join(
    dirname(path),
    `${basename(path)}.${randomBytes(TEMP_SUFFIX_BYTES).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporary, content, { mode: ENV_FILE_MODE, flag: 'wx' });
    // The umask can only remove bits, but set the mode explicitly so it never depends on it.
    await chmod(temporary, ENV_FILE_MODE);
    await rename(temporary, path);
  } catch (error: unknown) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function tightenMode(path: string): Promise<boolean> {
  const mode = (await stat(path)).mode & PERMISSION_BITS;
  if (mode === ENV_FILE_MODE) {
    return false;
  }
  await chmod(path, ENV_FILE_MODE);
  return true;
}

/**
 * Creates `.env` with every secret, or adds the missing ones to an existing file.
 * Existing values are never changed. When nothing is missing the file is not
 * written at all, so running setup again changes nothing.
 *
 * @throws InvalidEnvFileError when the existing file cannot be trusted; it is left untouched
 */
export async function ensureEnvFile(
  path: string,
  generate: SecretGenerator = generateSecret,
): Promise<EnvFileResult> {
  const existing = await readIfExists(path);
  const plan = planEnv(existing, generate);

  if (plan.added.length > 0) {
    await writeAtomically(path, plan.content);
    return { created: existing === undefined, added: plan.added, fixedMode: false };
  }
  return { created: false, added: [], fixedMode: await tightenMode(path) };
}
