import { runner } from 'node-pg-migrate';
import type pg from 'pg';
import type { Logger } from 'pino';

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
 * Applies pending migrations in one transaction under node-pg-migrate's
 * advisory lock. The schema must already exist: the role has no right to
 * create schemas (least privilege, ST16).
 */
export async function runMigrations(
  pool: pg.Pool,
  options: MigrationOptions,
  log: Logger,
): Promise<string[]> {
  const client = await pool.connect();
  try {
    const applied = await runner({
      dbClient: client,
      dir: options.dir,
      schema: options.schema,
      direction: 'up',
      migrationsTable: MIGRATIONS_TABLE,
      ignorePattern: NON_SQL_FILES,
      checkOrder: true,
      createSchema: false,
      singleTransaction: true,
      // The runner logs every statement at info; that belongs at debug.
      logger: {
        debug: (message: string): void => log.debug(message),
        info: (message: string): void => log.debug(message),
        warn: (message: string): void => log.warn(message),
        error: (message: string): void => log.error(message),
      },
    });
    return applied.map((migration) => migration.name);
  } finally {
    client.release();
  }
}
