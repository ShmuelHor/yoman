import { createQueryBuilder } from '@yoman/service-kit/sql';
import { Settings } from '@yoman/shared/settings';
import type { FastifyBaseLogger } from 'fastify';
import type { ColumnType } from 'kysely';
import type { Pool } from 'pg';

/** SPEC §4.1 load thresholds: `some avg10` percent that opens a memory, cpu or io incident. */
const DEFAULT_THRESHOLDS = { memory: 10, cpu: 40, io: 30 };

/**
 * What a fresh install runs with, before the user changes anything. Hebrew is
 * the default language (CLAUDE.md). Titles are stored unless the user opts out
 * (SPEC §7: "a don't store window titles setting").
 */
export const DEFAULT_SETTINGS: Settings = {
  language: 'he',
  theme: 'system',
  privacy: { storeTitles: true, excludedApps: [] },
  thresholds: DEFAULT_THRESHOLDS,
  systemApps: [],
  quietHours: { enabled: false },
};

/** `gateway.settings`, the only data the gateway owns (SPEC §5 gateway). */
export interface SettingsStore {
  /** The stored settings, or the defaults when none were saved yet. */
  read(): Promise<Settings>;
  /** Replaces all settings and returns what is now stored. */
  write(settings: Settings): Promise<Settings>;
}

/** `jsonb` written as serialized JSON text; read back as the parsed value. */
type Json = ColumnType<unknown, string, string>;

interface GatewayTables {
  settings: { id: boolean; value: Json };
}

/**
 * The settings in the gateway's own schema. A value that no longer matches
 * the shared schema fails the read rather than reaching a caller as typed data.
 */
export function createSettingsStore(pool: Pool): SettingsStore {
  const db = createQueryBuilder<GatewayTables>(pool);
  const read = async (): Promise<Settings> => {
    const row = await db
      .selectFrom('settings')
      .select('value')
      .where('id', '=', true)
      .executeTakeFirst();
    return row === undefined ? DEFAULT_SETTINGS : Settings.parse(row.value);
  };
  return {
    read,
    async write(settings): Promise<Settings> {
      const value = JSON.stringify(Settings.parse(settings));
      await db
        .insertInto('settings')
        .values({ id: true, value })
        .onConflict((conflict) => conflict.column('id').doUpdateSet({ value }))
        .execute();
      return read();
    },
  };
}

/**
 * The settings, or the defaults when they cannot be read. For callers that
 * must not fail because of a settings problem (a batch is still stored, a
 * focus still starts); the failure is logged.
 */
export async function readSettingsOrDefaults(
  store: SettingsStore,
  log: FastifyBaseLogger,
): Promise<Settings> {
  try {
    return await store.read();
  } catch (error: unknown) {
    log.warn({ err: error }, 'settings unreadable; used the defaults');
    return DEFAULT_SETTINGS;
  }
}
