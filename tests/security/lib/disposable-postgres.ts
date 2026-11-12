import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { z } from 'zod';

import { loadComposeProject } from './compose-config.js';

const run = promisify(execFile);

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const INIT_DIR = join(REPO_ROOT, 'infra/postgres/init');
/** Every role the init script creates; it refuses to start unless each has a password. */
const ROLES = ['sessions', 'reports', 'battery', 'system', 'focus', 'gateway'] as const;
export type ServiceRole = (typeof ROLES)[number];

const PROJECT_SUFFIX_BYTES = 4;
const PASSWORD_BYTES = 18;
const COMMAND_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 15_000;
const POSTGRES_PORT = 5432;
const PRIVATE_FILE_MODE = 0o600;

const Passwords = z.record(z.enum(ROLES), z.string());

/** `docker compose port` prints `127.0.0.1:49153`. */
const PublishedPort = z
  .string()
  .trim()
  .regex(/^127\.0\.0\.1:\d+$/)
  .transform((value) => Number(value.split(':')[1]));

/** Only what the Docker CLI needs, so no ambient COMPOSE_* variable changes the project. */
const dockerEnv = Object.fromEntries(
  ['PATH', 'HOME', 'DOCKER_CONFIG', 'DOCKER_HOST'].flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }),
);

export async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['info'], { env: dockerEnv, timeout: PROBE_TIMEOUT_MS });
    await run('docker', ['compose', 'version'], { env: dockerEnv, timeout: PROBE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export interface DisposablePostgres {
  readonly host: string;
  readonly port: number;
  readonly passwords: Readonly<Record<ServiceRole, string>>;
  /** Removes the container and its data. */
  readonly stop: () => Promise<void>;
}

/** The repo's own pinned Postgres image, so the test runs what Compose runs. */
async function postgresImage(): Promise<string> {
  const image = (await loadComposeProject(REPO_ROOT)).services['postgres']?.image;
  if (image === undefined) {
    throw new Error('The Compose project has no postgres image');
  }
  return image;
}

/**
 * Starts the repo's Postgres image with the repo's init script (one role and
 * schema per service), published on a random loopback port so a service can
 * run in-process against it. Data lives on a tmpfs and is gone after `stop`.
 */
export async function startPostgres(): Promise<DisposablePostgres> {
  const passwords = Passwords.parse(
    Object.fromEntries(ROLES.map((role) => [role, randomBytes(PASSWORD_BYTES).toString('hex')])),
  );
  const project = `yoman-pg-${randomBytes(PROJECT_SUFFIX_BYTES).toString('hex')}`;
  const dir = await mkdtemp(join(tmpdir(), 'yoman-pg-'));
  const file = join(dir, 'compose.json');
  const compose = (...args: string[]): Promise<{ stdout: string }> =>
    run('docker', ['compose', '-p', project, '-f', file, ...args], {
      env: dockerEnv,
      timeout: COMMAND_TIMEOUT_MS,
    });

  const environment = Object.fromEntries([
    ['POSTGRES_PASSWORD', randomBytes(PASSWORD_BYTES).toString('hex')],
    ...ROLES.map((role) => [`${role.toUpperCase()}_DB_PASSWORD`, passwords[role]]),
  ]);
  const definition = {
    services: {
      postgres: {
        image: await postgresImage(),
        environment,
        volumes: [`${INIT_DIR}:/docker-entrypoint-initdb.d:ro`],
        tmpfs: ['/var/lib/postgresql/data'],
        ports: [`127.0.0.1::${POSTGRES_PORT}`],
        // Over TCP, so it passes only once init is done and the real server listens.
        healthcheck: {
          test: ['CMD', 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'],
          interval: '1s',
          timeout: '3s',
          retries: 120,
        },
      },
    },
  };
  // Compose reads JSON as YAML. The file holds passwords, so it is private.
  await writeFile(file, JSON.stringify(definition), { mode: PRIVATE_FILE_MODE });

  const stop = async (): Promise<void> => {
    try {
      await compose('down', '-v', '--remove-orphans');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  try {
    await compose('up', '-d', '--wait');
    const { stdout } = await compose('port', 'postgres', String(POSTGRES_PORT));
    return { host: '127.0.0.1', port: PublishedPort.parse(stdout), passwords, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
