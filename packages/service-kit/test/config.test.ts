import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { assertServiceName, dbPasswordVariable, loadConfig } from '../src/config.js';

const SECRET = 'not-a-real-secret-4f9a';

describe('loadConfig', () => {
  it('applies defaults and binds the role and schema to the service name', () => {
    const config = loadConfig('sessions', { SESSIONS_DB_PASSWORD: SECRET });
    expect(config).toEqual({
      host: '127.0.0.1',
      port: 8080,
      logLevel: 'info',
      db: {
        host: 'postgres',
        port: 5432,
        database: 'postgres',
        user: 'sessions',
        schema: 'sessions',
        password: SECRET,
      },
      service: {},
    });
  });

  it('coerces numeric variables', () => {
    const config = loadConfig('goals', {
      GOALS_DB_PASSWORD: SECRET,
      PORT: '9001',
      DB_PORT: '6543',
    });
    expect({ port: config.port, dbPort: config.db.port }).toEqual({ port: 9001, dbPort: 6543 });
  });

  it('names the missing password variable', () => {
    expect(() => loadConfig('battery', {})).toThrow(/BATTERY_DB_PASSWORD/);
  });

  it('names invalid variables without echoing their values', () => {
    const run = (): unknown =>
      loadConfig('system', { SYSTEM_DB_PASSWORD: SECRET, PORT: 'port-secret-value' });
    expect(run).toThrow(/PORT/);
    expect(run).not.toThrow(/port-secret-value/);
  });

  it('validates the service schema and types the result', () => {
    const extra = z.object({ RETENTION_DAYS: z.coerce.number().int().positive() });
    const config = loadConfig(
      'reports',
      { REPORTS_DB_PASSWORD: SECRET, RETENTION_DAYS: '90' },
      extra,
    );
    expect(config.service).toEqual({ RETENTION_DAYS: 90 });
    expect(() => loadConfig('reports', { REPORTS_DB_PASSWORD: SECRET }, extra)).toThrow(
      /RETENTION_DAYS/,
    );
  });
});

describe('service names', () => {
  it('maps a name to its password variable', () => {
    expect(dbPasswordVariable('focus')).toBe('FOCUS_DB_PASSWORD');
  });

  it.each(['Sessions', 'a-b', 'x;drop', '', '1abc', 'a b'])('rejects %j', (name) => {
    expect(() => assertServiceName(name)).toThrow(/Invalid service name/);
  });
});
