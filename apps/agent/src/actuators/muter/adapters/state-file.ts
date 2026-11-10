import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensurePrivateDir, writePrivateFileAtomic } from '../../../core/private-fs.js';
import { EMPTY_MUTE_STATE, MuteState } from '../domain/mute-state.js';

const MAX_STATE_BYTES = 262_144;

/**
 * Loads `mute-state.json`. A missing file is an empty state. A corrupt one
 * is too, and `corrupt` says so: there is nothing trustworthy to restore from.
 */
export async function loadMuteState(path: string): Promise<{ state: MuteState; corrupt: boolean }> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { state: EMPTY_MUTE_STATE, corrupt: false };
    }
    throw error;
  }
  if (text.length > MAX_STATE_BYTES) {
    return { state: EMPTY_MUTE_STATE, corrupt: true };
  }
  try {
    const parsed = MuteState.safeParse(JSON.parse(text));
    return parsed.success
      ? { state: parsed.data, corrupt: false }
      : { state: EMPTY_MUTE_STATE, corrupt: true };
  } catch {
    return { state: EMPTY_MUTE_STATE, corrupt: true };
  }
}

/** Saves atomically at `0600` in a `0700` directory, so a crash never leaves half a file. */
export async function saveMuteState(path: string, state: MuteState): Promise<void> {
  await ensurePrivateDir(dirname(path));
  await writePrivateFileAtomic(path, `${JSON.stringify(state)}\n`);
}
