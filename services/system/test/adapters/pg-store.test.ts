import { describe, expect, it, vi } from 'vitest';

import { createPgStore } from '../../src/adapters/pg-store.js';

describe('createPgStore', () => {
  it('runs the work in one transaction on one client', async () => {
    const statements: string[] = [];
    const client = {
      query: async (text: string): Promise<{ rows: unknown[] }> => {
        statements.push(text);
        return { rows: [] };
      },
      release: vi.fn(),
    };
    const pool = { connect: async (): Promise<typeof client> => client };

    const marks = await createPgStore(pool).transaction(async (tx) => {
      await tx.lockTracks();
      return tx.recordedUntil();
    });

    expect(marks).toEqual({ pressure: null, processes: null, thermal: null });
    expect(statements[0]).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledWith(false);
  });
});
