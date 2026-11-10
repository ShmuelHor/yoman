import { execFile } from 'node:child_process';
import type {
  SessionBus,
  SignalHandler,
  SignalMatch,
  Unsubscribe,
} from '../../../core/session-bus.js';
import { MAX_GSETTINGS_OUTPUT_LENGTH } from '../domain/application-children.js';

/** gsettings answers from a local file; a slow one is stuck, not busy. */
export const GSETTINGS_TIMEOUT_MS = 2_000;

const GET_APPLICATION_CHILDREN = [
  'get',
  'org.gnome.desktop.notifications',
  'application-children',
] as const;

/**
 * Every dconf write goes through dconf-service, which announces it with this
 * signal, so watching it is event-driven, like `gsettings monitor`, without
 * a child process that runs for the agent's lifetime.
 */
const DCONF_NOTIFY: SignalMatch = {
  sender: 'ca.desrt.dconf',
  path: '/ca/desrt/dconf/Writer/user',
  interface: 'ca.desrt.dconf.Writer',
  member: 'Notify',
};

/** Runs a fixed program with an args array; never a shell. Resolves with stdout, unparsed. */
export type RunFile = (file: string, args: readonly string[]) => Promise<unknown>;

export const runFile: RunFile = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: GSETTINGS_TIMEOUT_MS, maxBuffer: MAX_GSETTINGS_OUTPUT_LENGTH, encoding: 'utf8' },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });

/** Runs `gsettings get org.gnome.desktop.notifications application-children`. */
export function readApplicationChildren(run: RunFile): Promise<unknown> {
  return run('gsettings', GET_APPLICATION_CHILDREN);
}

/** Calls `handler` with each unparsed dconf change signal. */
export function subscribeDconfChanges(
  bus: SessionBus,
  handler: SignalHandler,
): Promise<Unsubscribe> {
  return bus.subscribe(DCONF_NOTIFY, handler);
}
