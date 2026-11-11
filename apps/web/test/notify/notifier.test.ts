import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/api/client.js';
import { createNotifier, type Enqueue, isDegraded } from '../../src/notify/notifier.js';

const SERVER_ERROR = 500;
const MAX_BUFFERED = 20;

/** Echoes the key and its parameters, so tests see what would be translated. */
const t = ((key: string, params?: Record<string, string>): string =>
  params === undefined ? key : `${key} ${JSON.stringify(params)}`) as never;

describe('createNotifier', () => {
  it('shows a translated message with its variant', () => {
    const enqueue = vi.fn<Enqueue>();
    const notifier = createNotifier({ t });
    notifier.connect(enqueue);

    notifier.success('settings:saved');
    notifier.info('focus:started');
    notifier.warning('common:notify.degraded');

    expect(enqueue.mock.calls.map(([message, variant]) => [message, variant])).toEqual([
      ['settings:saved', 'success'],
      ['focus:started', 'info'],
      ['common:notify.degraded', 'warning'],
    ]);
  });

  it('adds the request id to an API error and shows a generic message otherwise', () => {
    const enqueue = vi.fn<Enqueue>();
    const notifier = createNotifier({ t });
    notifier.connect(enqueue);

    notifier.error(new ApiError('week', SERVER_ERROR, 'boom', 'req-1'));
    notifier.error(new ApiError('week', SERVER_ERROR, 'boom'));
    notifier.error(new Error('internal detail'));

    expect(enqueue.mock.calls.map(([message]) => message)).toEqual([
      'common:notify.errorWithId {"requestId":"req-1"}',
      'common:notify.error',
      'common:notify.error',
    ]);
  });

  it('holds toasts raised before the host connects, and shows them on connect', () => {
    const enqueue = vi.fn<Enqueue>();
    const notifier = createNotifier({ t });

    notifier.error(new Error('early'));
    expect(enqueue).not.toHaveBeenCalled();
    notifier.connect(enqueue);

    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('caps the toasts held before the host connects', () => {
    const enqueue = vi.fn<Enqueue>();
    const notifier = createNotifier({ t });

    for (let i = 0; i < MAX_BUFFERED * 2; i += 1) {
      notifier.info('a:b');
    }
    notifier.connect(enqueue);

    expect(enqueue).toHaveBeenCalledTimes(MAX_BUFFERED);
  });

  it('stops showing toasts after the host disconnects', () => {
    const enqueue = vi.fn<Enqueue>();
    const notifier = createNotifier({ t });
    const disconnect = notifier.connect(enqueue);

    disconnect();
    notifier.info('a:b');

    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('isDegraded', () => {
  it('is true only for a response that lists unavailable services', () => {
    expect(isDegraded({ data: {}, degraded: ['battery'] })).toBe(true);
    expect(isDegraded({ data: {}, degraded: [] })).toBe(false);
    expect(isDegraded({ items: [] })).toBe(false);
    expect(isDegraded(undefined)).toBe(false);
  });
});
