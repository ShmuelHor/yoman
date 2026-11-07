import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import { ComposeModel } from './compose-policy.js';

const run = promisify(execFile);

/** 16 MiB. Compose output for a full project stays far below this; the cap only guards against runaway output. */
const MAX_OUTPUT_BYTES = 16_777_216;

/** The file names Compose looks for, in its own order of preference. */
export const COMPOSE_FILE_NAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;

const ENV_EXAMPLE = '.env.example';
const NO_ENV_FILE = '/dev/null';

/** The only parts of the caller's environment that Compose needs to find and run its CLI plugin. */
const ComposeEnv = z.object({
  PATH: z.string().optional(),
  HOME: z.string().optional(),
  DOCKER_CONFIG: z.string().optional(),
});

/**
 * A minimal environment for the Compose CLI. Shell variables override the env
 * file during interpolation, and COMPOSE_FILE, COMPOSE_PROFILES and friends
 * change which files and services are loaded, so none of them are passed on.
 */
function composeEnv(): NodeJS.ProcessEnv {
  const { PATH, HOME, DOCKER_CONFIG } = ComposeEnv.parse(process.env);
  return Object.fromEntries(
    Object.entries({ PATH, HOME, DOCKER_CONFIG }).filter(([, value]) => value !== undefined),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Whether `directory` holds a Compose project, judged by the file names Compose itself looks for. */
export async function hasComposeProject(directory: string): Promise<boolean> {
  const found = await Promise.all(COMPOSE_FILE_NAMES.map((name) => exists(join(directory, name))));
  return found.includes(true);
}

/**
 * The env file used for interpolation: the project's `.env.example`, so the
 * result is the same everywhere and a developer's real `.env` is never read.
 * Without one, interpolation gets no file at all.
 */
async function envFileFor(directory: string): Promise<string> {
  const example = join(directory, ENV_EXAMPLE);
  return (await exists(example)) ? example : NO_ENV_FILE;
}

async function composeConfig(cwd: string, fileArgs: readonly string[]): Promise<ComposeModel> {
  const envFile = await envFileFor(cwd);
  const { stdout } = await run(
    'docker',
    ['compose', ...fileArgs, '--env-file', envFile, '--profile', '*', 'config', '--format', 'json'],
    { cwd, env: composeEnv(), maxBuffer: MAX_OUTPUT_BYTES },
  );
  const raw: unknown = JSON.parse(stdout);
  return ComposeModel.parse(raw);
}

/**
 * Resolves the Compose project in `directory` exactly as `docker compose up`
 * would find it: no `--file`, so Compose picks the standard file name and
 * merges `docker-compose.override.yml` when present. Every profile is enabled,
 * so a service hidden behind a profile is still checked. This needs only the
 * Compose CLI, not a running Docker daemon.
 */
export async function loadComposeProject(directory: string): Promise<ComposeModel> {
  return composeConfig(directory, []);
}

/** Resolves one Compose file on its own, for fixtures. */
export async function loadComposeFile(file: string, directory: string): Promise<ComposeModel> {
  return composeConfig(directory, ['--file', file]);
}
