import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SERVICES = ['sessions', 'reports', 'goals', 'battery', 'system', 'focus', 'gateway'] as const;
const STARTUP_TIMEOUT_MS = 180_000;
const QUERY_TIMEOUT_MS = 30_000;
/** Random bytes in the project name and each password; hex doubles the length. */
const PROJECT_SUFFIX_BYTES = 4;
const PASSWORD_BYTES = 18;
const PROJECT = `yoman-st16-${randomBytes(PROJECT_SUFFIX_BYTES).toString('hex')}`;

/** Same minimal environment the ST01 helper gives Compose: no ambient COMPOSE_* variables. */
const env = Object.fromEntries(
  ['PATH', 'HOME', 'DOCKER_CONFIG', 'DOCKER_HOST'].flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }),
);

async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['info'], { env, timeout: 15_000 });
    await run('docker', ['compose', 'version'], { env, timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const available = await dockerAvailable();
const passwords = Object.fromEntries(
  ['postgres', ...SERVICES].map((name) => [name, randomBytes(PASSWORD_BYTES).toString('hex')]),
);

let envDir = '';
let envFile = '';

function compose(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run('docker', ['compose', '-p', PROJECT, '--env-file', envFile, ...args], {
    cwd: REPO_ROOT,
    env,
    timeout: STARTUP_TIMEOUT_MS,
  });
}

/** Runs one statement over TCP, so password authentication applies, as `role`. */
async function sql(role: string, statement: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout } = await compose(
      'exec',
      '-T',
      '-e',
      `PGPASSWORD=${passwords[role] ?? ''}`,
      'postgres',
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      role,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-c',
      statement,
    );
    return { ok: true, output: stdout.trim() };
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    return { ok: false, output: typeof stderr === 'string' ? stderr : String(error) };
  }
}

describe.skipIf(!available)('ST16 database least privilege', () => {
  beforeAll(async () => {
    envDir = await mkdtemp(join(tmpdir(), 'yoman-st16-'));
    envFile = join(envDir, 'env');
    const lines = [
      `POSTGRES_PASSWORD=${passwords['postgres'] ?? ''}`,
      ...SERVICES.map((name) => `${name.toUpperCase()}_DB_PASSWORD=${passwords[name] ?? ''}`),
    ];
    await writeFile(envFile, `${lines.join('\n')}\n`, { mode: 0o600 });
    await compose('up', '-d', '--wait', 'postgres');
    for (const name of SERVICES) {
      const created = await sql(
        name,
        'CREATE TABLE secret (v text); INSERT INTO secret VALUES (1)',
      );
      expect(created.ok, created.output).toBe(true);
    }
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    if (envFile !== '') {
      try {
        // Not swallowed: a failed teardown would leak a running database.
        await compose('down', '-v', '--remove-orphans');
      } finally {
        await rm(envDir, { recursive: true, force: true });
      }
    }
  }, STARTUP_TIMEOUT_MS);

  it('puts each role in its own schema by default', { timeout: QUERY_TIMEOUT_MS }, async () => {
    for (const name of SERVICES) {
      // regclass text drops the schema when it is on the search_path, so ask for it.
      const query =
        "SELECT relnamespace::regnamespace FROM pg_class WHERE oid = to_regclass('secret')";
      expect(await sql(name, query)).toEqual({
        ok: true,
        output: name,
      });
    }
  });

  const pairs = SERVICES.flatMap((reader) =>
    SERVICES.filter((owner) => owner !== reader).map((owner) => [reader, owner] as const),
  );

  it.each(pairs)(
    'role %s cannot read or write the %s schema',
    { timeout: QUERY_TIMEOUT_MS },
    async (reader, owner) => {
      const read = await sql(reader, `SELECT * FROM ${owner}.secret`);
      const write = await sql(reader, `CREATE TABLE ${owner}.planted (v int)`);

      expect(read.ok).toBe(false);
      expect(read.output).toContain('permission denied');
      expect(write.ok).toBe(false);
    },
  );

  it('does not let a role create objects in the public schema', {
    timeout: QUERY_TIMEOUT_MS,
  }, async () => {
    const result = await sql('sessions', 'CREATE TABLE public.shared (v int)');

    expect(result.ok).toBe(false);
    expect(result.output).toContain('permission denied');
  });
});
