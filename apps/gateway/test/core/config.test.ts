import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/core/config.js';
import { AGENT_TOKEN, GATEWAY_DB_PASSWORD } from '../harness.js';

describe('loadConfig', () => {
  it('applies defaults for everything but the agent token', () => {
    const config = loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      logLevel: 'info',
      development: false,
      logFormat: 'json',
      agentToken: AGENT_TOKEN,
    });
    expect(config.serviceUrls.battery.href).toBe('http://battery:8080/');
    expect(Object.keys(config.serviceUrls)).toEqual([
      'sessions',
      'reports',
      'goals',
      'battery',
      'system',
      'focus',
    ]);
  });

  it('reads the listen address, log level and service URLs', () => {
    const config = loadConfig({
      AGENT_TOKEN,
      GATEWAY_DB_PASSWORD,
      HOST: '0.0.0.0',
      PORT: '9000',
      LOG_LEVEL: 'warn',
      FOCUS_URL: 'http://127.0.0.1:9100',
    });

    expect(config).toMatchObject({ host: '0.0.0.0', port: 9000, logLevel: 'warn' });
    expect(config.serviceUrls.focus.href).toBe('http://127.0.0.1:9100/');
  });

  it('defaults LOG_FORMAT to pretty in development and json elsewhere, and lets it be set', () => {
    const format = (env: Record<string, string>): string =>
      loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, ...env }).logFormat;
    expect(format({ NODE_ENV: 'development' })).toBe('pretty');
    expect(format({ NODE_ENV: 'development', LOG_FORMAT: 'json' })).toBe('json');
    expect(format({ LOG_FORMAT: 'pretty' })).toBe('pretty');
    expect(() => format({ LOG_FORMAT: 'xml' })).toThrow(/LOG_FORMAT/);
  });

  it('turns on development features only for NODE_ENV=development', () => {
    expect(
      loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, NODE_ENV: 'development' }).development,
    ).toBe(true);
    expect(
      loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, NODE_ENV: 'production' }).development,
    ).toBe(false);
    expect(() => loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, NODE_ENV: 'dev' })).toThrow(
      'NODE_ENV',
    );
  });

  it('requires the agent token and the database password', () => {
    expect(() => loadConfig({})).toThrow(
      'Invalid environment configuration: AGENT_TOKEN, GATEWAY_DB_PASSWORD',
    );
  });

  it('connects as its own role to its own schema, and reads the database address', () => {
    const config = loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, DB_HOST: 'db', DB_PORT: '5433' });

    expect(config.db).toEqual({
      host: 'db',
      port: 5433,
      database: 'postgres',
      user: 'gateway',
      schema: 'gateway',
      password: GATEWAY_DB_PASSWORD,
    });
  });

  it('rejects an empty database password without echoing a wrong one', () => {
    expect(() => loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD: '' })).toThrow(
      /GATEWAY_DB_PASSWORD$/,
    );
  });

  it('rejects a short token without echoing it', () => {
    const short = 'short-agent-token-value';

    expect(() => loadConfig({ AGENT_TOKEN: short, GATEWAY_DB_PASSWORD })).toThrow(/AGENT_TOKEN$/);
    expect(() => loadConfig({ AGENT_TOKEN: short, GATEWAY_DB_PASSWORD })).not.toThrow(short);
  });

  it.each([
    ['PORT', '0'],
    ['PORT', 'http'],
    ['LOG_LEVEL', 'verbose'],
    ['SESSIONS_URL', 'https://sessions:8080'],
    ['SESSIONS_URL', 'not a url'],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => loadConfig({ AGENT_TOKEN, GATEWAY_DB_PASSWORD, [name]: value })).toThrow(
      `Invalid environment configuration: ${name}`,
    );
  });
});
