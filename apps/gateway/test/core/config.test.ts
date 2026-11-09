import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/core/config.js';
import { AGENT_TOKEN } from '../harness.js';

describe('loadConfig', () => {
  it('applies defaults for everything but the agent token', () => {
    const config = loadConfig({ AGENT_TOKEN });

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      logLevel: 'info',
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
      HOST: '0.0.0.0',
      PORT: '9000',
      LOG_LEVEL: 'warn',
      FOCUS_URL: 'http://127.0.0.1:9100',
    });

    expect(config).toMatchObject({ host: '0.0.0.0', port: 9000, logLevel: 'warn' });
    expect(config.serviceUrls.focus.href).toBe('http://127.0.0.1:9100/');
  });

  it('requires the agent token', () => {
    expect(() => loadConfig({})).toThrow('Invalid environment configuration: AGENT_TOKEN');
  });

  it('rejects a short token without echoing it', () => {
    const short = 'short-agent-token-value';

    expect(() => loadConfig({ AGENT_TOKEN: short })).toThrow(/AGENT_TOKEN$/);
    expect(() => loadConfig({ AGENT_TOKEN: short })).not.toThrow(short);
  });

  it.each([
    ['PORT', '0'],
    ['PORT', 'http'],
    ['LOG_LEVEL', 'verbose'],
    ['SESSIONS_URL', 'https://sessions:8080'],
    ['SESSIONS_URL', 'not a url'],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => loadConfig({ AGENT_TOKEN, [name]: value })).toThrow(
      `Invalid environment configuration: ${name}`,
    );
  });
});
