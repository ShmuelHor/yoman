import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAgentToken } from '../../src/core/agent-token.js';
import { ConfigError } from '../../src/core/config.js';

async function envFile(text: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'yoman-token-')), '.env');
  await writeFile(path, text);
  return path;
}

describe('loadAgentToken', () => {
  it('prefers the process environment over the file', async () => {
    const file = await envFile('AGENT_TOKEN=from-file\n');

    await expect(loadAgentToken({ env: { AGENT_TOKEN: 'from-env' }, envFile: file })).resolves.toBe(
      'from-env',
    );
  });

  it('reads only AGENT_TOKEN from the file', async () => {
    const file = await envFile('DB_PASSWORD=other\nAGENT_TOKEN=from-file\n');

    await expect(loadAgentToken({ env: {}, envFile: file })).resolves.toBe('from-file');
  });

  it('fails with a setup hint when there is no token', async () => {
    const missing = join(await mkdtemp(join(tmpdir(), 'yoman-token-')), '.env');

    await expect(loadAgentToken({ env: {}, envFile: missing })).rejects.toThrow(ConfigError);
    await expect(loadAgentToken({ env: {}, envFile: await envFile('X=1\n') })).rejects.toThrow(
      /npm run setup/,
    );
  });

  it('rejects a malformed token without echoing it', async () => {
    const error = await loadAgentToken({ env: { AGENT_TOKEN: 'bad token!' }, envFile: '/x' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ConfigError);
    expect(error instanceof Error ? error.message : '').not.toContain('bad token');
  });
});
