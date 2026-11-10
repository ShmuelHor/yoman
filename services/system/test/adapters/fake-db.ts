import { createQueryBuilder } from '@yoman/service-kit/sql';
import type {
  Kysely,
  PostgresCursor,
  PostgresPool,
  PostgresPoolClient,
  PostgresQueryResult,
} from 'kysely';
import { type Mock, vi } from 'vitest';

import type { SystemDatabase } from '../../src/adapters/database.js';

export interface Query {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A pool client that records every query and answers it with the rows `answer` gives for its SQL. */
class FakeClient implements PostgresPoolClient {
  readonly queries: Query[] = [];
  readonly release: Mock<(destroy?: boolean) => void> = vi.fn();

  constructor(private readonly answer: (text: string) => unknown[]) {}

  query<R>(sql: string, parameters: readonly unknown[]): Promise<PostgresQueryResult<R>>;
  query<R>(cursor: PostgresCursor<R>): PostgresCursor<R>;
  query(
    input: string | PostgresCursor<unknown>,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<unknown>> | PostgresCursor<unknown> {
    if (typeof input !== 'string') {
      return input;
    }
    this.queries.push({ text: input, values });
    const rows = this.answer(input);
    return Promise.resolve({ command: 'SELECT', rowCount: rows.length, rows });
  }
}

export interface FakeDb {
  readonly pool: PostgresPool;
  readonly db: Kysely<SystemDatabase>;
  /** Every statement sent, transaction control included, in order. */
  readonly queries: Query[];
  readonly release: FakeClient['release'];
}

/** A query builder over a one-client pool that records queries instead of running them. */
export function fakeDb(answer: (text: string) => unknown[] = () => []): FakeDb {
  const client = new FakeClient(answer);
  const pool: PostgresPool = {
    options: {},
    connect: async () => client,
    end: async () => undefined,
  };
  return {
    pool,
    db: createQueryBuilder<SystemDatabase>(pool),
    queries: client.queries,
    release: client.release,
  };
}
