import { describe, expect, it } from 'vitest';

import { createPgStore } from '../../src/adapters/pg-store.js';
import { fakeDb } from './fake-db.js';

describe('createPgStore', () => {
  it('runs the work in one transaction on one client', async () => {
    const { pool, queries, release } = fakeDb();

    const marks = await createPgStore(pool).transaction(async (tx) => {
      await tx.lockTracks();
      return tx.recordedUntil();
    });

    expect(marks).toEqual({ pressure: null, processes: null, thermal: null });
    expect(queries[0]?.text).toBe('begin');
    expect(queries.at(-1)?.text).toBe('commit');
    expect(release).toHaveBeenCalledOnce();
  });
});
