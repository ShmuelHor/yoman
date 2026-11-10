import { execFile } from 'node:child_process';
import { AppId } from '@yoman/shared/common';
import { BannerValue } from '../domain/mute-state.js';

const GSETTINGS_TIMEOUT_MS = 2_000;
const MAX_OUTPUT_LENGTH = 64;
const APP_SCHEMA = 'org.gnome.desktop.notifications.application';
const APP_PATH_PREFIX = '/org/gnome/desktop/notifications/application/';
const KEY = 'show-banners';

/** Runs a fixed program with an args array; never a shell. Resolves with stdout. */
export type RunFile = (file: string, args: readonly string[]) => Promise<string>;

export const runFile: RunFile = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: GSETTINGS_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_LENGTH, encoding: 'utf8' },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });

/** `schema:/path/` of one app. Throws on an id that is not a plain app id. */
function schemaFor(appId: string): string {
  return `${APP_SCHEMA}:${APP_PATH_PREFIX}${AppId.parse(appId)}/`;
}

/** Reads the app's current `show-banners`; the default (true) when it was never set. */
export async function readShowBanners(run: RunFile, appId: string): Promise<BannerValue> {
  const output = await run('gsettings', ['get', schemaFor(appId), KEY]);
  return BannerValue.parse(output.trim());
}

export async function writeShowBanners(
  run: RunFile,
  appId: string,
  value: BannerValue,
): Promise<void> {
  await run('gsettings', ['set', schemaFor(appId), KEY, value]);
}
