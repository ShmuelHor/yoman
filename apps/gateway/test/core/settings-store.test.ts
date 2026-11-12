import type { Settings } from '@yoman/shared/settings';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type DisposablePostgres,
  dockerAvailable,
  startPostgres,
} from '../../../../tests/security/lib/disposable-postgres.js';
import { connectDatabase, type GatewayDatabase } from '../../src/core/database.js';
import { createSettingsStore, DEFAULT_SETTINGS } from '../../src/core/settings-store.js';

const STARTUP_TIMEOUT_MS = 240_000;
const available = await dockerAvailable();

const CHANGED: Settings = {
  language: 'en',
  theme: 'dark',
  privacy: { storeTitles: false, excludedApps: ['keepassxc'] },
  thresholds: { memory: 15, cpu: 50, io: 35 },
  systemApps: ['org.gnome.Settings'],
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
};

/** Against the repo's own Postgres image and init script, as the gateway's least-privilege role. */
describe.skipIf(!available)('createSettingsStore', () => {
  let postgres: DisposablePostgres | undefined;
  let database: GatewayDatabase | undefined;

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await connectDatabase(
      {
        host: postgres.host,
        port: postgres.port,
        database: 'postgres',
        user: 'gateway',
        schema: 'gateway',
        password: postgres.passwords.gateway,
      },
      pino({ level: 'silent' }),
    );
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    try {
      await database?.close();
    } finally {
      await postgres?.stop();
    }
  }, STARTUP_TIMEOUT_MS);

  function store(): ReturnType<typeof createSettingsStore> {
    if (database === undefined) {
      throw new Error('the database did not start');
    }
    return createSettingsStore(database.pool);
  }

  it('reads the defaults before anything was saved', async () => {
    expect(await store().read()).toEqual(DEFAULT_SETTINGS);
  });

  it('stores the settings and replaces them on the next write', async () => {
    const settings = store();

    expect(await settings.write(CHANGED)).toEqual(CHANGED);
    expect(await settings.write(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(await settings.read()).toEqual(DEFAULT_SETTINGS);
  });

  it('refuses a value that does not match the schema, so nothing bad is stored', async () => {
    // @ts-expect-error an invalid theme, on purpose
    const attempt = store().write({ ...CHANGED, theme: 'neon' });

    await expect(attempt).rejects.toThrow();
    expect(await store().read()).toEqual(DEFAULT_SETTINGS);
  });
});
