import type { PostgresCursor, PostgresPool, PostgresPoolClient, PostgresQueryResult } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  asText,
  createQueryBuilder,
  inTransaction,
  parseRow,
  parseRows,
  pgArray,
  toPgText,
  unnest,
} from '../src/sql.js';

interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
}

interface Tables {
  readonly items: { readonly id: string; readonly name: string };
}

/** A pool client that records statements and can fail on a chosen one. Kysely streams nothing here. */
class FakeClient implements PostgresPoolClient {
  readonly statements: Statement[] = [];
  readonly release = vi.fn();

  constructor(private readonly failOn?: string) {}

  query<R>(sql: string, parameters: readonly unknown[]): Promise<PostgresQueryResult<R>>;
  query<R>(cursor: PostgresCursor<R>): PostgresCursor<R>;
  query(
    input: string | PostgresCursor<unknown>,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<unknown>> | PostgresCursor<unknown> {
    if (typeof input !== 'string') {
      return input;
    }
    this.statements.push({ text: input, values });
    if (input.toLowerCase() === this.failOn) {
      return Promise.reject(new Error(`${input} failed`));
    }
    return Promise.resolve({ command: 'SELECT', rowCount: 0, rows: [] });
  }
}

/** A pool with one client. */
function fakePool(failOn?: string): {
  pool: PostgresPool;
  statements: Statement[];
  release: FakeClient['release'];
} {
  const client = new FakeClient(failOn);
  const pool: PostgresPool = {
    options: {},
    connect: async () => client,
    end: async () => undefined,
  };
  return { pool, statements: client.statements, release: client.release };
}

const texts = (statements: readonly Statement[]): string[] =>
  statements.map((statement) => statement.text.toLowerCase());

describe('toPgText', () => {
  it('replaces NUL, which Postgres text cannot store, keeping the length', () => {
    expect(toPgText('a\u0000b')).toBe('a�b');
    expect(toPgText(null)).toBeNull();
  });
});

describe('parseRows', () => {
  const Row = z.object({ count: z.coerce.number() });

  it('parses every row', () => {
    expect(parseRows(Row, [{ count: '2' }])).toEqual([{ count: 2 }]);
  });

  it('fails on a row that does not match', () => {
    expect(() => parseRows(Row, [{ count: 'many' }])).toThrow();
  });

  it('turns a missing single row into null', () => {
    expect(parseRow(Row, undefined)).toBeNull();
    expect(parseRow(Row, { count: 1 })).toEqual({ count: 1 });
  });
});

describe('inTransaction', () => {
  it('commits and releases when the work resolves', async () => {
    const { pool, statements, release } = fakePool();
    const db = createQueryBuilder<Tables>(pool);

    await expect(inTransaction(db, async () => 'done')).resolves.toBe('done');

    expect(texts(statements)).toEqual(['begin', 'commit']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('runs the work on the transaction connection', async () => {
    const { pool, statements } = fakePool();
    const db = createQueryBuilder<Tables>(pool);

    await inTransaction(db, (trx) => trx.selectFrom('items').select('id').execute());

    expect(texts(statements)).toEqual(['begin', 'select "id" from "items"', 'commit']);
  });

  it('rolls back and rethrows when the work throws', async () => {
    const { pool, statements, release } = fakePool();
    const db = createQueryBuilder<Tables>(pool);
    const failure = new Error('work failed');

    await expect(inTransaction(db, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(texts(statements)).toEqual(['begin', 'rollback']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps the original error and releases the client when even the rollback fails', async () => {
    const { pool, release } = fakePool('rollback');
    const db = createQueryBuilder<Tables>(pool);
    const failure = new Error('work failed');

    await expect(inTransaction(db, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(release).toHaveBeenCalledOnce();
  });
});

describe('unnest', () => {
  it('sends each column as one cast array parameter', () => {
    const db = createQueryBuilder<Tables>(fakePool().pool);

    const query = db
      .insertInto('items')
      .columns(['id', 'name'])
      .expression((eb) =>
        eb
          .selectFrom(
            unnest<Tables['items'], 't'>('t', {
              id: pgArray('uuid', ['a', 'b']),
              name: pgArray('text', ['x', 'y']),
            }),
          )
          .selectAll(),
      )
      .compile();

    expect(query.sql).toBe(
      'insert into "items" ("id", "name") select * from unnest($1::uuid[], $2::text[]) as "t"("id", "name")',
    );
    expect(query.parameters).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ]);
  });

  it('adds a position column on request', () => {
    const db = createQueryBuilder<Tables>(fakePool().pool);

    const query = db
      .selectFrom(
        unnest<{ id: string }, 't'>('t', { id: pgArray('text', []) }, { ordinality: 'ord' }),
      )
      .selectAll()
      .compile();

    expect(query.sql).toBe('select * from unnest($1::text[]) with ordinality as "t"("id", "ord")');
  });
});

describe('asText', () => {
  it('reads a column as text under an alias', () => {
    const db = createQueryBuilder<Tables>(fakePool().pool);

    const query = db.selectFrom('items').select(asText('name', 'label')).compile();

    expect(query.sql).toBe('select "name"::text as "label" from "items"');
  });
});
