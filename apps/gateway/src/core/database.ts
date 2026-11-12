import { fileURLToPath } from 'node:url';

import type { DatabaseConfig } from '@yoman/service-kit/config';
import { createPool } from '@yoman/service-kit/database';
import { runMigrations } from '@yoman/service-kit/migrations';
import type { Pool } from 'pg';
import type { Logger } from 'pino';

/** The SQL migrations of the `gateway` schema, in `apps/gateway/migrations` next to `src` and `dist`. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** The gateway's connection to its own schema. */
export interface GatewayDatabase {
  /** `search_path` is pinned to the `gateway` schema. */
  readonly pool: Pool;
  /** Idempotent. */
  readonly close: () => Promise<void>;
}

export type ConnectDatabase = (config: DatabaseConfig, log: Logger) => Promise<GatewayDatabase>;

/**
 * Opens the pool as the gateway's own role and applies its migrations. On a
 * failure the pool is released, so a gateway that cannot start leaves nothing open.
 */
export const connectDatabase: ConnectDatabase = async (config, log) => {
  const pool = createPool(config, 'gateway');
  // An idle client losing its connection must not crash the process.
  pool.on('error', (error) => log.error({ err: error }, 'Idle database client failed'));
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= pool.end();
    return closing;
  };
  try {
    const applied = await runMigrations(pool, { dir: MIGRATIONS_DIR, schema: config.schema }, log);
    log.info({ migrations: applied }, 'Migrations applied');
  } catch (error: unknown) {
    await close();
    throw error;
  }
  return { pool, close };
};
