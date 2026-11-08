import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureEnvFile, generateSecret, UnsafeEnvFileError } from './env-file.js';
import { InvalidEnvFileError, parseEnv, SECRETS } from './env-secrets.js';

const PERMISSION_BITS = 0o777;
/**
 * SECURITY §5, written as a literal on purpose: comparing with the module's own
 * constant would let a regression in that constant pass.
 */
const OWNER_ONLY = 0o600;
const WIDE_MODE = 0o644;
const PERMISSIVE_UMASK = 0o000;
const NO_PERMISSIONS = 0o000;
const SECRET_BYTES = 32;
const HEX_LENGTH = SECRET_BYTES * 2;

let dir: string;
let envPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'yoman-setup-'));
  envPath = join(dir, '.env');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & PERMISSION_BITS;
}

describe('generateSecret', () => {
  it('returns 32 random bytes as base64url', () => {
    const secret = generateSecret();

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(secret, 'base64url')).toHaveLength(SECRET_BYTES);
    expect(generateSecret()).not.toBe(secret);
  });
});

describe('ensureEnvFile', () => {
  // ST15 (the .env part): .env is created with mode 0600.
  it('creates .env with mode 0600 and every secret', async () => {
    const result = await ensureEnvFile(envPath);

    expect(result).toEqual({
      created: true,
      added: SECRETS.map(({ key }) => key),
      fixedMode: false,
    });
    expect(await modeOf(envPath)).toBe(OWNER_ONLY);
    expect(parseEnv(await readFile(envPath, 'utf8'))).toHaveLength(SECRETS.length);
  });

  it('creates .env with mode 0600 even under a permissive umask', async () => {
    const previous = process.umask(PERMISSIVE_UMASK);
    try {
      await ensureEnvFile(envPath);
    } finally {
      process.umask(previous);
    }

    expect(await modeOf(envPath)).toBe(OWNER_ONLY);
  });

  it('changes nothing on a second run', async () => {
    await ensureEnvFile(envPath);
    const before = await readFile(envPath, 'utf8');
    const { mtimeMs } = await stat(envPath);

    const result = await ensureEnvFile(envPath);

    expect(result).toEqual({ created: false, added: [], fixedMode: false });
    expect(await readFile(envPath, 'utf8')).toBe(before);
    expect((await stat(envPath)).mtimeMs).toBe(mtimeMs);
  });

  it('adds missing keys, keeps existing values and stays 0600', async () => {
    const token = 'ab'.repeat(HEX_LENGTH / 2);
    await writeFile(envPath, `AGENT_TOKEN=${token}\n`, { mode: WIDE_MODE });

    const result = await ensureEnvFile(envPath);

    expect(result.created).toBe(false);
    expect(result.added).toHaveLength(SECRETS.length - 1);
    expect(parseEnv(await readFile(envPath, 'utf8'))).toContainEqual({
      key: 'AGENT_TOKEN',
      value: token,
    });
    expect(await modeOf(envPath)).toBe(OWNER_ONLY);
  });

  it('tightens the mode of a complete .env without touching its content', async () => {
    await ensureEnvFile(envPath);
    const before = await readFile(envPath, 'utf8');
    await chmod(envPath, WIDE_MODE);

    const result = await ensureEnvFile(envPath);

    expect(result).toEqual({ created: false, added: [], fixedMode: true });
    expect(await modeOf(envPath)).toBe(OWNER_ONLY);
    expect(await readFile(envPath, 'utf8')).toBe(before);
  });

  it('leaves an invalid .env untouched and leaves no temporary file behind', async () => {
    const content = 'POSTGRES_PASSWORD=change-me\n';
    await writeFile(envPath, content, { mode: OWNER_ONLY });

    await expect(ensureEnvFile(envPath)).rejects.toBeInstanceOf(InvalidEnvFileError);
    expect(await readFile(envPath, 'utf8')).toBe(content);
    expect(await readdir(dir)).toEqual(['.env']);
  });

  it('cleans up the temporary file when the write fails', async () => {
    const missingDir = join(dir, 'missing', '.env');

    await expect(ensureEnvFile(missingDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a symlinked .env without following or replacing it', async () => {
    const target = join(dir, 'elsewhere');
    await writeFile(target, '', { mode: OWNER_ONLY });
    await symlink(target, envPath);

    await expect(ensureEnvFile(envPath)).rejects.toBeInstanceOf(UnsafeEnvFileError);
    expect((await lstat(envPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('');
  });

  it('refuses a dangling symlink instead of creating its target', async () => {
    const target = join(dir, 'planted');
    await symlink(target, envPath);

    await expect(ensureEnvFile(envPath)).rejects.toMatchObject({ code: 'UNSAFE_ENV_FILE' });
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses a .env that is not a regular file', async () => {
    await mkdir(envPath);

    await expect(ensureEnvFile(envPath)).rejects.toThrow('is not a regular file');
  });

  it('propagates other open errors, such as an unreadable .env', async () => {
    await writeFile(envPath, '', { mode: NO_PERMISSIONS });

    await expect(ensureEnvFile(envPath)).rejects.toMatchObject({ code: 'EACCES' });
  });
});
