import { runner } from 'node-pg-migrate';
import type pg from 'pg';
import type { Logger } from 'pino';

import { withMigrationLock } from './migration-lock.js';

/** node-pg-migrate's default name, kept inside the service's own schema. */
const MIGRATIONS_TABLE = 'pgmigrations';

/**
 * SQL files only (`-- Up Migration` / `-- Down Migration`). The runner would
 * otherwise `require()` every other file in the directory, `.d.ts` and source
 * maps included.
 */
export const NON_SQL_FILES = '(?!.*\\.sql$).*';

export interface MigrationOptions {
  readonly dir: string;
  readonly schema: string;
}

/**
 * Applies pending migrations in one transaction under a per-schema advisory
 * lock (see `withMigrationLock`). The schema must already exist: the role has
 * no right to create schemas (least privilege, ST16).
 */
export async function runMigrations(
  pool: pg.Pool,
  options: MigrationOptions,
  log: Logger,
): Promise<string[]> {
  const client = await pool.connect();
  let failed = false;
  try {
    const applied = await withMigrationLock(client, options.schema, () =>
      runner({
        dbClient: client,
        dir: options.dir,
        schema: options.schema,
        direction: 'up',
        migrationsTable: MIGRATIONS_TABLE,
        ignorePattern: NON_SQL_FILES,
        checkOrder: true,
        createSchema: false,
        singleTransaction: true,
        // node-pg-migrate's own lock is one fixed key for the whole database,
        // so services sharing `postgres` fail with "Another migration is
        // already running" when they start together. Skipping it is safe:
        // this same client already holds the schema's advisory lock, so two
        // runs on one schema still never overlap, and each service only
        // migrates its own schema.
        noLock: true,
        // The runner logs every statement at info; that belongs at debug.
        logger: {
          debug: (message: string): void => log.debug(message),
          info: (message: string): void => log.debug(message),
          warn: (message: string): void => log.warn(message),
          error: (message: string): void => log.error(message),
        },
      }),
    );
    return applied.map((migration) => migration.name);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // After a failure the connection is destroyed rather than pooled, so a
    // session lock that could not be released dies with it.
    client.release(failed);
  }
}
