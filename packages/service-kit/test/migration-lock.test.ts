import { describe, expect, it } from 'vitest';

import { type LockClient, migrationLockKey, withMigrationLock } from '../src/migration-lock.js';

/** node-pg-migrate's fixed, database-wide key, which every service used to share. */
const NODE_PG_MIGRATE_LOCK_ID = 7241865325823964n;
const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;

/**
 * In-memory stand-in for Postgres session advisory locks: `pg_advisory_lock`
 * waits until the key is free, `pg_advisory_unlock` hands it to the next waiter.
 */
class FakeAdvisoryLocks {
  private readonly held = new Set<string>();
  private readonly waiters = new Map<string, Array<() => void>>();

  client(): LockClient {
    return {
      query: async (sql: string, values: readonly unknown[]): Promise<unknown> => {
        const key = String(values[0]);
        if (sql.includes('pg_advisory_unlock')) {
          this.release(key);
          return { rows: [{ pg_advisory_unlock: true }] };
        }
        await this.acquire(key);
        return { rows: [{ pg_advisory_lock: '' }] };
      },
    };
  }

  isHeld(key: bigint): boolean {
    return this.held.has(key.toString());
  }

  private acquire(key: string): Promise<void> {
    if (!this.held.has(key)) {
      this.held.add(key);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = this.waiters.get(key) ?? [];
      queue.push(resolve);
      this.waiters.set(key, queue);
    });
  }

  private release(key: string): void {
    const next = this.waiters.get(key)?.shift();
    if (next) {
      next();
      return;
    }
    this.held.delete(key);
  }
}

/** A migration run that records its start and end and finishes only when told to. */
function controlledRun(
  name: string,
  events: string[],
): { work: () => Promise<string>; finish: () => void } {
  let finish = (): void => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const work = async (): Promise<string> => {
    events.push(`${name}:start`);
    await done;
    events.push(`${name}:end`);
    return name;
  };
  return { work, finish: () => finish() };
}

/** Lets every queued promise callback run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('migrationLockKey', () => {
  it('is stable for the same schema', () => {
    expect(migrationLockKey('sessions')).toBe(migrationLockKey('sessions'));
  });

  it('differs between service schemas', () => {
    const schemas = ['sessions', 'goals', 'reports', 'battery', 'system', 'focus'];
    const keys = new Set(schemas.map((schema) => migrationLockKey(schema)));
    expect(keys.size).toBe(schemas.length);
  });

  it('fits a signed 64-bit key and never equals node-pg-migrate’s shared key', () => {
    const key = migrationLockKey('sessions');
    expect(key >= INT64_MIN && key <= INT64_MAX).toBe(true);
    expect(key).not.toBe(NODE_PG_MIGRATE_LOCK_ID);
  });
});

describe('withMigrationLock', () => {
  it('lets two services migrate concurrently without either failing', async () => {
    const locks = new FakeAdvisoryLocks();
    const events: string[] = [];
    const sessions = controlledRun('sessions', events);
    const goals = controlledRun('goals', events);

    const runs = Promise.all([
      withMigrationLock(locks.client(), 'sessions', sessions.work),
      withMigrationLock(locks.client(), 'goals', goals.work),
    ]);
    await flush();
    const startedBeforeAnyEnded = [...events];
    sessions.finish();
    goals.finish();

    await expect(runs).resolves.toEqual(['sessions', 'goals']);
    expect(startedBeforeAnyEnded).toEqual(['sessions:start', 'goals:start']);
  });

  it('serializes two runs of the same service', async () => {
    const locks = new FakeAdvisoryLocks();
    const events: string[] = [];
    const first = controlledRun('first', events);
    const second = controlledRun('second', events);

    const firstRun = withMigrationLock(locks.client(), 'sessions', first.work);
    const secondRun = withMigrationLock(locks.client(), 'sessions', second.work);
    await flush();
    const whileFirstHoldsLock = [...events];
    first.finish();
    await firstRun;
    await flush();
    second.finish();
    await secondRun;

    expect(whileFirstHoldsLock).toEqual(['first:start']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('releases the lock when the migration throws', async () => {
    const locks = new FakeAdvisoryLocks();
    const failing = (): Promise<never> => Promise.reject(new Error('bad migration'));

    await expect(withMigrationLock(locks.client(), 'goals', failing)).rejects.toThrow(
      'bad migration',
    );

    expect(locks.isHeld(migrationLockKey('goals'))).toBe(false);
  });

  it('locks on the schema key, passed as a bigint parameter', async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client: LockClient = {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    };

    await withMigrationLock(client, 'battery', async () => undefined);

    const key = migrationLockKey('battery').toString();
    expect(calls).toEqual([
      { sql: 'SELECT pg_advisory_lock($1::bigint)', values: [key] },
      { sql: 'SELECT pg_advisory_unlock($1::bigint)', values: [key] },
    ]);
  });
});
