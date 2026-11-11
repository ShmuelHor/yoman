import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, loadAgentConfig, parseAgentConfig } from '../../src/core/config.js';

const DEFAULTS = { gatewayUrl: 'http://127.0.0.1:4711', logLevel: 'info', logFormat: 'pretty' };

describe('parseAgentConfig', () => {
  it('fills every default from an empty object', () => {
    expect(parseAgentConfig('{}')).toEqual(DEFAULTS);
  });

  it('accepts explicit values', () => {
    const config = parseAgentConfig('{"gatewayUrl":"http://127.0.0.1:9000","logLevel":"debug"}');
    expect(config).toEqual({
      gatewayUrl: 'http://127.0.0.1:9000',
      logLevel: 'debug',
      logFormat: 'pretty',
    });
  });

  it.each([
    'http://example.com:4711',
    'https://127.0.0.1:4711',
    'http://localhost:4711',
    'http://127.0.0.1:4711/v1',
    'http://127.0.0.1:4711/?x=1',
    'http://user:pass@127.0.0.1:4711',
    'http://127.0.0.1:4711/#frag',
    'not a url',
  ])('rejects a gateway that is not a bare loopback origin: %s', (gatewayUrl) => {
    expect(() => parseAgentConfig(JSON.stringify({ gatewayUrl }))).toThrow(ConfigError);
  });

  it('rejects unknown keys without echoing their values', () => {
    const secret = 'super-secret-token-value';
    expect(() => parseAgentConfig(JSON.stringify({ token: secret }))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });

  it.each(['[]', 'null', '"x"'])(
    'names the root when the document is not an object: %s',
    (text) => {
      expect(() => parseAgentConfig(text)).toThrow('(root)');
    },
  );

  it('rejects malformed JSON', () => {
    expect(() => parseAgentConfig('{')).toThrow('not valid JSON');
  });
});

describe('loadAgentConfig', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-config-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns the defaults when the file is missing', async () => {
    expect(await loadAgentConfig(join(root, 'agent.json'))).toEqual(DEFAULTS);
  });

  it('reads and validates the file', async () => {
    const file = join(root, 'agent.json');
    await writeFile(file, '{"logLevel":"warn"}');
    expect((await loadAgentConfig(file)).logLevel).toBe('warn');
  });

  it('surfaces read errors other than a missing file', async () => {
    await expect(loadAgentConfig(root)).rejects.toThrow();
  });

  it('accepts json logs and rejects an unknown format', () => {
    expect(parseAgentConfig('{"logFormat":"json"}').logFormat).toBe('json');
    expect(() => parseAgentConfig('{"logFormat":"xml"}')).toThrow(/logFormat/);
  });
});
