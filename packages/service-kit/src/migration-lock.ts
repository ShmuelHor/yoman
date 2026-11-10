import { createHash } from 'node:crypto';

/** Namespaces the hash so the key can't collide with another use of the schema name. */
const LOCK_KEY_PREFIX = 'yoman:migrations:';
/** `pg_advisory_lock(bigint)` takes a signed 64-bit key: the first 8 bytes of the digest. */
const LOCK_KEY_OFFSET = 0;

/** What the lock needs from a connection. `pg.PoolClient` satisfies it. */
export interface LockClient {
  query: (sql: string, values: readonly unknown[]) => Promise<unknown>;
}

/**
 * The advisory lock key for one schema's migrations: the first 8 bytes of
 * `sha256("yoman:migrations:<schema>")` read as a signed big-endian 64-bit
 * integer. Stable across releases and processes, and distinct per schema, so
 * services sharing one database never wait on each other.
 */
export function migrationLockKey(schema: string): bigint {
  const digest = createHash('sha256').update(`${LOCK_KEY_PREFIX}${schema}`).digest();
  return digest.readBigInt64BE(LOCK_KEY_OFFSET);
}

/**
 * Runs `work` while holding the schema's session-level advisory lock on
 * `client`. `pg_advisory_lock` waits rather than fails, so a second instance
 * of the same service queues behind the first instead of crashing. The lock
 * is released in `finally`, whether `work` succeeds or throws.
 */
export async function withMigrationLock<T>(
  client: LockClient,
  schema: string,
  work: () => Promise<T>,
): Promise<T> {
  // pg sends a bigint parameter as text; the cast makes Postgres pick the
  // single-key (bigint) overload.
  const key = migrationLockKey(schema).toString();
  await client.query('SELECT pg_advisory_lock($1::bigint)', [key]);
  try {
    return await work();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [key]);
  }
}
