import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, type FileHandle, open, rename, rm, writeFile } from 'node:fs/promises';
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

/**
 * Thrown when `.env` is a symlink or not a regular file. A planted symlink could
 * redirect where secrets are read from and written to, so setup refuses to
 * follow or replace it.
 */
export class UnsafeEnvFileError extends Error {
  readonly code = 'UNSAFE_ENV_FILE';

  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`${path} ${reason}. Remove it and run \`npm run setup\` again.`);
    this.name = 'UnsafeEnvFileError';
  }
}

/**
 * Opens an existing `.env` without following a symlink (`O_NOFOLLOW`), so the
 * check and the read are one step and cannot race. `undefined` means no file.
 */
async function openExisting(path: string): Promise<FileHandle | undefined> {
  try {
    return await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error: unknown) {
    const code = FsError.safeParse(error).data?.code;
    if (code === 'ENOENT') {
      return undefined;
    }
    if (code === 'ELOOP') {
      throw new UnsafeEnvFileError(path, 'is a symlink');
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

/**
 * Creates `.env` with every secret, or adds the missing ones to an existing file.
 * Existing values are never changed. When nothing is missing the file is not
 * written at all, so running setup again changes nothing; only a too-wide mode
 * is tightened.
 *
 * @throws InvalidEnvFileError when the existing file cannot be trusted; it is left untouched
 * @throws UnsafeEnvFileError when `.env` is a symlink or not a regular file
 */
export async function ensureEnvFile(
  path: string,
  generate: SecretGenerator = generateSecret,
): Promise<EnvFileResult> {
  const handle = await openExisting(path);
  if (handle === undefined) {
    const plan = planEnv(undefined, generate);
    await writeAtomically(path, plan.content);
    return { created: true, added: plan.added, fixedMode: false };
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new UnsafeEnvFileError(path, 'is not a regular file');
    }
    const plan = planEnv(await handle.readFile('utf8'), generate);
    if (plan.added.length > 0) {
      await writeAtomically(path, plan.content);
      return { created: false, added: plan.added, fixedMode: false };
    }
    if ((stats.mode & PERMISSION_BITS) === ENV_FILE_MODE) {
      return { created: false, added: [], fixedMode: false };
    }
    await handle.chmod(ENV_FILE_MODE);
    return { created: false, added: [], fixedMode: true };
  } finally {
    await handle.close();
  }
}
