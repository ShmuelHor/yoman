import { describe, expect, it } from 'vitest';

import { pingDatabase } from '../src/database.js';

describe('pingDatabase', () => {
  it('is true when the query succeeds', async () => {
    await expect(pingDatabase({ query: async () => ({ rows: [] }) })).resolves.toBe(true);
  });

  it('is false when the query fails', async () => {
    await expect(pingDatabase({ query: () => Promise.reject(new Error('down')) })).resolves.toBe(
      false,
    );
  });

  it('is false when the database does not answer in time', async () => {
    const never = (): Promise<unknown> => new Promise(() => undefined);
    await expect(pingDatabase({ query: never }, 10)).resolves.toBe(false);
  });
});
