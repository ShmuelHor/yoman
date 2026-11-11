import { describe, expect, it } from 'vitest';

import { ApiError } from '../../src/api/client.js';
import { createQueryClient } from '../../src/app/query-client.js';
import { fakeNotifier } from '../support/fake-notifier.js';

const UNAUTHORIZED = 401;
const SERVER_ERROR = 500;

describe('createQueryClient toasts', () => {
  it('shows an error toast for a failed query, and none for a successful read', async () => {
    const notifier = fakeNotifier();
    const client = createQueryClient(notifier);
    const failure = new ApiError('week', SERVER_ERROR, 'boom', 'req-1');

    await client.fetchQuery({ queryKey: ['ok'], queryFn: async () => ({ total: 1 }) });
    await client
      .fetchQuery({ queryKey: ['bad'], queryFn: () => Promise.reject(failure), retry: false })
      .catch(() => undefined);

    expect(notifier.error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(notifier.success).not.toHaveBeenCalled();
    expect(notifier.warning).not.toHaveBeenCalled();
  });

  it('warns when a read answers with degraded services', async () => {
    const notifier = fakeNotifier();
    const client = createQueryClient(notifier);

    await client.fetchQuery({
      queryKey: ['today'],
      queryFn: async () => ({ data: {}, degraded: ['battery'] }),
    });

    expect(notifier.warning).toHaveBeenCalledExactlyOnceWith('common:notify.degraded');
  });

  it('shows the success toast a mutation declares in meta.successMessage', async () => {
    const notifier = fakeNotifier();
    const client = createQueryClient(notifier);

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: async () => ({ id: 1 }),
        meta: { successMessage: 'settings:saved' },
      })
      .execute(undefined);

    expect(notifier.success).toHaveBeenCalledExactlyOnceWith('settings:saved');
  });

  it('shows no success toast for a mutation that declares none', async () => {
    const notifier = fakeNotifier();
    const client = createQueryClient(notifier);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => 1 })
      .execute(undefined);

    expect(notifier.success).not.toHaveBeenCalled();
  });

  it('shows an error toast for a failed mutation, and no success toast', async () => {
    const notifier = fakeNotifier();
    const client = createQueryClient(notifier);
    const failure = new Error('nope');

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(failure),
        meta: { successMessage: 'settings:saved' },
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(notifier.error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(notifier.success).not.toHaveBeenCalled();
  });
});

describe('createQueryClient retries', () => {
  it('does not retry a 401, but retries other failures once', async () => {
    const client = createQueryClient(fakeNotifier());
    const options = client.getDefaultOptions().queries;
    const retry = options?.retry;
    if (typeof retry !== 'function') {
      throw new Error('retry should be a function');
    }

    expect(retry(0, new ApiError('week', UNAUTHORIZED, 'no'))).toBe(false);
    expect(retry(0, new ApiError('week', SERVER_ERROR, 'boom'))).toBe(true);
    expect(retry(1, new ApiError('week', SERVER_ERROR, 'boom'))).toBe(false);
  });
});
