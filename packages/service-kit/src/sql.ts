import {
  type AliasedRawBuilder,
  type ColumnType,
  Kysely,
  PostgresDialect,
  type PostgresPool,
  type RawBuilder,
  sql,
} from 'kysely';
import type { z } from 'zod';

/**
 * A typed query builder over the service's pool. Kysely compiles every value
 * into a bind parameter, so queries stay parameterized (SECURITY A8). The pool
 * stays owned by the service: nothing here ends it.
 */
export function createQueryBuilder<Database>(pool: PostgresPool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * Runs `work` between BEGIN and COMMIT on one connection, rolling back if it
 * throws. The caller always sees the error `work` threw, even when the
 * rollback fails as well.
 */
export async function inTransaction<Database, T>(
  db: Kysely<Database>,
  work: (trx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  const trx = await db.startTransaction().execute();
  try {
    const result = await work(trx);
    await trx.commit().execute();
    return result;
  } catch (error) {
    try {
      await trx.rollback().execute();
    } catch {
      // The connection itself failed. Kysely releases it anyway and the pool
      // discards a client that can no longer query, so the original error is what matters.
    }
    throw error;
  }
}

/** A `timestamptz` column: read as a `Date`, written as a `Date` or an ISO string. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * A `date` column, always read through {@link asText}: pg would turn a bare
 * `date` into a `Date` at the server's local midnight. A bare read fails the
 * row's `z.iso.date()` instead of shifting a day.
 */
export type LocalDate = ColumnType<string, string, string>;

/** `column::text AS alias`, for `date` columns (see {@link LocalDate}). */
export function asText<Alias extends string>(
  column: string,
  alias: Alias,
): AliasedRawBuilder<string, Alias> {
  return sql<string>`${sql.ref(column)}::text`.as(alias);
}

/** Parses every row, so a schema drift or a bad row fails loudly here instead of reaching a response. */
export function parseRows<T>(schema: z.ZodType<T>, rows: readonly unknown[]): T[] {
  return rows.map((row) => schema.parse(row));
}

/** Like {@link parseRows} for a query that returns at most one row. */
export function parseRow<T>(schema: z.ZodType<T>, row: unknown): T | null {
  return row === undefined ? null : schema.parse(row);
}

const NUL = '\u0000';
const REPLACEMENT_CHARACTER = '�';

/**
 * Postgres `text` cannot hold U+0000 and fails the whole statement on it. A
 * window title is untrusted and may contain one, so free text is stored with
 * the replacement character instead; the length stays the same.
 */
export function toPgText(value: string): string;
export function toPgText(value: string | null): string | null;
export function toPgText(value: string | null): string | null {
  return value === null ? null : value.replaceAll(NUL, REPLACEMENT_CHARACTER);
}

/** The element types an array parameter may be cast to: a fixed list, so no cast is built from input. */
export type PgElementType =
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'float8'
  | 'integer'
  | 'jsonb'
  | 'text'
  | 'timestamptz'
  | 'uuid';

/** One array bind parameter with an explicit cast, such as `$1::uuid[]`. */
export function pgArray<T>(type: PgElementType, values: readonly T[]): RawBuilder<T[]> {
  return sql<T[]>`${[...values]}::${sql.raw(type)}[]`;
}

/** Column name → typed array; every array must have the same length. */
export type UnnestColumns<Row> = { readonly [Column in keyof Row & string]: RawBuilder<unknown> };

export interface UnnestOptions {
  /** Adds a 1-based position column under this name (`WITH ORDINALITY`). */
  readonly ordinality?: string;
}

/**
 * `unnest(...) AS alias(columns)`: a batch as one array parameter per column.
 * The statement's parameter count stays constant however many rows it carries,
 * so an ingest batch never runs into Postgres's 65 535 parameter limit.
 */
export function unnest<Row, Alias extends string>(
  alias: Alias,
  columns: UnnestColumns<Row>,
  options: UnnestOptions = {},
): AliasedRawBuilder<Row, Alias> {
  const entries = Object.entries<RawBuilder<unknown>>(columns);
  const names = entries.map(([name]) => name);
  const arrays = entries.map(([, array]) => array);
  const aliases = [...names, ...(options.ordinality === undefined ? [] : [options.ordinality])];
  const ordinality = options.ordinality === undefined ? sql`` : sql` with ordinality`;
  return sql<Row>`unnest(${sql.join(arrays)})${ordinality}`.as<Alias>(
    sql`${sql.id(alias)}(${sql.join(aliases.map((name) => sql.id(name)))})`,
  );
}
