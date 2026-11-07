import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ENV_FILE_MODE, ensureEnvFile, generateSecret } from './env-file.js';
import { InvalidEnvFileError, parseEnv, SECRETS } from './env-secrets.js';

const PERMISSION_BITS = 0o777;
const WIDE_MODE = 0o644;
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
    expect(await modeOf(envPath)).toBe(ENV_FILE_MODE);
    expect(parseEnv(await readFile(envPath, 'utf8'))).toHaveLength(SECRETS.length);
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
    expect(await modeOf(envPath)).toBe(ENV_FILE_MODE);
  });

  it('tightens the mode of a complete .env without touching its content', async () => {
    await ensureEnvFile(envPath);
    const before = await readFile(envPath, 'utf8');
    await chmod(envPath, WIDE_MODE);

    const result = await ensureEnvFile(envPath);

    expect(result).toEqual({ created: false, added: [], fixedMode: true });
    expect(await modeOf(envPath)).toBe(ENV_FILE_MODE);
    expect(await readFile(envPath, 'utf8')).toBe(before);
  });

  it('leaves an invalid .env untouched and leaves no temporary file behind', async () => {
    const content = 'POSTGRES_PASSWORD=change-me\n';
    await writeFile(envPath, content, { mode: ENV_FILE_MODE });

    await expect(ensureEnvFile(envPath)).rejects.toBeInstanceOf(InvalidEnvFileError);
    expect(await readFile(envPath, 'utf8')).toBe(content);
    expect(await readdir(dir)).toEqual(['.env']);
  });

  it('cleans up the temporary file when the write fails', async () => {
    const missingDir = join(dir, 'missing', '.env');

    await expect(ensureEnvFile(missingDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(dir)).toEqual([]);
  });

  it('propagates read errors other than a missing file', async () => {
    await expect(ensureEnvFile(dir)).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
