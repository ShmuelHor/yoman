import type { Queryable } from '../../src/adapters/sql.js';

export interface Query {
  readonly text: string;
  readonly values: readonly unknown[];
}

export interface FakeDb extends Queryable {
  readonly queries: Query[];
}

/** Records every query and answers it with the rows `answer` gives for its SQL. */
export function fakeDb(answer: (text: string) => unknown[] = () => []): FakeDb {
  const queries: Query[] = [];
  return {
    queries,
    query: async (text, values = []): Promise<{ rows: unknown[] }> => {
      queries.push({ text, values });
      return { rows: answer(text) };
    },
  };
}
