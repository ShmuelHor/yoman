import { chmod, mkdir, open, rename, stat } from 'node:fs/promises';

/** SECURITY §5: agent state is readable by its owner only. */
export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;
const PERMISSION_BITS = 0o777;

/** The permission bits of a path, without the file type. */
export async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & PERMISSION_BITS;
}

/**
 * Creates a directory (and missing parents) and forces it to `0700`.
 * `mkdir`'s mode is masked by the umask and ignored for existing directories,
 * so the final `chmod` is what guarantees the mode.
 */
export async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: PRIVATE_DIR_MODE });
  await chmod(path, PRIVATE_DIR_MODE);
}

/** Forces an existing file to `0600`, for files written by an older or crashed run. */
export async function ensurePrivateFile(path: string): Promise<void> {
  await chmod(path, PRIVATE_FILE_MODE);
}

/** Appends to a file, creating it at `0600` if it is new. */
export async function appendPrivateFile(path: string, data: string): Promise<void> {
  const handle = await open(path, 'a', PRIVATE_FILE_MODE);
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.appendFile(data, 'utf8');
  } finally {
    await handle.close();
  }
}

/** Replaces a file atomically: a crash leaves either the old or the new content, never half. */
export async function writePrivateFileAtomic(path: string, data: Buffer | string): Promise<void> {
  const temp = `${path}.tmp`;
  const handle = await open(temp, 'w', PRIVATE_FILE_MODE);
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
}
