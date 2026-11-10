import { constants, type FSWatcher, watch as fsWatch } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import {
  type DesktopEntry,
  MAX_DESKTOP_FILE_BYTES,
  parseDesktopEntry,
} from '../domain/desktop-entry.js';
import type { DirectoryListing } from '../domain/known-apps.js';

/** More desktop files than any one directory holds; the rest of a larger one is ignored. */
export const MAX_DESKTOP_FILES_PER_DIR = 5_000;

const DESKTOP_FILE = /\.desktop$/;
const MASKED: DesktopEntry = { status: 'masked' };
/** Never block on a FIFO someone named `x.desktop`, and never follow it to a device. */
const READ_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK;

/** The environment variables the applications directories depend on. */
export interface ApplicationsEnv {
  readonly HOME?: string | undefined;
  readonly XDG_DATA_HOME?: string | undefined;
}

/**
 * The applications directories of SPEC §4.1, in XDG precedence order: the
 * user's own (`~/.local`, where Chrome puts its web apps), flatpak, then the
 * system's (apt) and snap.
 */
export function applicationsDirs(env: ApplicationsEnv): string[] {
  const home = env.HOME;
  if (home === undefined || !isAbsolute(home)) {
    throw new Error('HOME must be set to an absolute path');
  }
  const dataHome =
    env.XDG_DATA_HOME !== undefined && isAbsolute(env.XDG_DATA_HOME)
      ? env.XDG_DATA_HOME
      : join(home, '.local', 'share');
  return [
    join(dataHome, 'applications'),
    join(dataHome, 'flatpak', 'exports', 'share', 'applications'),
    '/var/lib/flatpak/exports/share/applications',
    '/usr/local/share/applications',
    '/usr/share/applications',
    '/var/lib/snapd/desktop/applications',
  ];
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

/** Reads at most one byte past the limit, so an oversized file is detected, never loaded. */
async function readDesktopFile(path: string): Promise<DesktopEntry> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, READ_FLAGS);
    if (!(await file.stat()).isFile()) {
      return MASKED;
    }
    const buffer = Buffer.alloc(MAX_DESKTOP_FILE_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return parseDesktopEntry(buffer.toString('utf8', 0, bytesRead));
  } catch {
    // Removed mid-scan, unreadable, or a dangling symlink: like a deleted entry.
    return MASKED;
  } finally {
    await file?.close();
  }
}

/**
 * Reads every `.desktop` file directly in `dir`, keyed by desktop file ID.
 * Returns `undefined` when the directory does not exist.
 */
export async function readApplicationsDir(dir: string): Promise<DirectoryListing | undefined> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error: unknown) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
  const desktopIds = names
    .filter((name) => DESKTOP_FILE.test(name))
    .sort()
    .slice(0, MAX_DESKTOP_FILES_PER_DIR);
  const listing = new Map<string, DesktopEntry>();
  for (const desktopId of desktopIds) {
    listing.set(desktopId, await readDesktopFile(join(dir, desktopId)));
  }
  return listing;
}

/** Stops watching a directory. */
export type CloseWatch = () => void;

/** inotify on one directory; `fs.watch`'s signature, so tests can fake it. */
export type WatchDir = (
  dir: string,
  onChange: () => void,
  onError: (error: unknown) => void,
) => CloseWatch;

/**
 * Watches `dir` with inotify (through `fs.watch`): no polling, and no cost
 * between installs. The watch never keeps the agent alive on its own.
 */
export const watchDir: WatchDir = (dir, onChange, onError) => {
  const watcher: FSWatcher = fsWatch(dir, { persistent: false }, () => {
    onChange();
  });
  // Without a listener, an 'error' event (the directory was removed) would crash the agent.
  watcher.on('error', (error: unknown) => {
    watcher.close();
    onError(error);
  });
  return (): void => {
    watcher.close();
  };
};
