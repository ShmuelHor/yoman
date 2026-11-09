import type { z } from 'zod';

/** A connection that can run a parameterized query: a pool client inside a transaction. */
export interface Queryable {
  readonly query: (text: string, values?: unknown[]) => Promise<{ readonly rows: unknown[] }>;
}

/** A pooled connection; `release(true)` destroys it instead of returning it to the pool. */
export interface PooledClient extends Queryable {
  readonly release: (destroy?: boolean) => void;
}

/** What a transaction needs from the pool. `pg.Pool` satisfies it. */
export interface ClientPool {
  readonly connect: () => Promise<PooledClient>;
}

/**
 * Runs a parameterized query and parses every row, so a schema drift or a
 * bad row fails loudly here instead of reaching a response.
 */
export async function selectRows<T>(
  db: Queryable,
  schema: z.ZodType<T>,
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await db.query(text, [...values]);
  return result.rows.map((row) => schema.parse(row));
}

/** Like {@link selectRows} for a query that returns at most one row. */
export async function selectRow<T>(
  db: Queryable,
  schema: z.ZodType<T>,
  text: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  const [row] = await selectRows(db, schema, text, values);
  return row ?? null;
}

/** Runs `work` between BEGIN and COMMIT on one pool client, rolling back if it throws. */
export async function inTransaction<T>(
  pool: ClientPool,
  work: (client: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection itself failed; it is destroyed below and the original error is what matters.
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
