import { describe, expect, it, vi } from 'vitest';

import { type ClientPool, inTransaction } from '../../src/adapters/sql.js';

interface FakeClient {
  readonly statements: string[];
  readonly release: ReturnType<typeof vi.fn>;
}

/** A pool whose one client records statements and can fail on a chosen one. */
function fakePool(failOn?: string): { pool: ClientPool; client: FakeClient } {
  const statements: string[] = [];
  const release = vi.fn();
  const query = async (text: string): Promise<{ rows: [] }> => {
    statements.push(text);
    if (text === failOn) {
      throw new Error(`${text} failed`);
    }
    return { rows: [] };
  };
  const pool: ClientPool = { connect: async () => ({ query, release }) };
  return { pool, client: { statements, release } };
}

describe('inTransaction', () => {
  it('commits and releases when the work resolves', async () => {
    const { pool, client } = fakePool();

    await expect(inTransaction(pool, async () => 'done')).resolves.toBe('done');

    expect(client.statements).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rolls back and rethrows when the work throws', async () => {
    const { pool, client } = fakePool();
    const failure = new Error('work failed');

    await expect(inTransaction(pool, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(client.statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('destroys the client when even the rollback fails, keeping the original error', async () => {
    const { pool, client } = fakePool('ROLLBACK');
    const failure = new Error('work failed');

    await expect(inTransaction(pool, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(client.release).toHaveBeenCalledWith(true);
  });
});
