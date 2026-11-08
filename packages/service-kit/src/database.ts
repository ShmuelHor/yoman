import pg from 'pg';

import type { DatabaseConfig } from './config.js';

const POOL_SIZE = 5;
const CONNECT_TIMEOUT_MS = 3_000;
const STATEMENT_TIMEOUT_MS = 5_000;
const PING_TIMEOUT_MS = 2_000;

/** What `/health` needs from the pool, so tests can pass a stub. */
export interface Pingable {
  query: (sql: string) => Promise<unknown>;
}

/**
 * The service's own role, with `search_path` pinned to its own schema, so an
 * unqualified table name can never resolve into another service's data.
 * The schema name is a validated identifier (see `assertServiceName`).
 */
export function createPool(config: DatabaseConfig, applicationName: string): pg.Pool {
  return new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: `-c search_path=${config.schema}`,
    application_name: applicationName,
    max: POOL_SIZE,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
}

/** True when the database answers within the timeout. Never throws. */
export async function pingDatabase(db: Pingable, timeoutMs = PING_TIMEOUT_MS): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const ping = db.query('SELECT 1').then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
