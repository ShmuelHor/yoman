import type { KnownApp } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestRequestError } from '../../src/sender/adapters/ingest-client.js';
import type {
  KnownAppsClient,
  KnownAppsHttpReply,
} from '../../src/sender/adapters/known-apps-client.js';
import { createKnownAppsReporter, FIRST_RETRY_MS } from '../../src/sender/known-apps-reporter.js';
import { recordingLogger } from '../support/logs.js';

const LONG_WAIT_MS = 3_600_000;
const ATTEMPTS_UNTIL_SENT = 3;
const OK: KnownAppsHttpReply = { status: 200, body: { added: 1 } };
const TELEGRAM: KnownApp = {
  appId: 'telegram-desktop',
  name: 'Telegram Desktop',
  source: 'desktop',
};
const FILES: KnownApp = { appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' };

function setup(replies: (KnownAppsHttpReply | Error)[] = []): {
  post: ReturnType<typeof vi.fn<KnownAppsClient['post']>>;
  reporter: ReturnType<typeof createKnownAppsReporter>;
  logs: unknown[];
} {
  const post = vi.fn<KnownAppsClient['post']>(() => {
    const next = replies.shift() ?? OK;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const { logger, logs } = recordingLogger();
  return { post, reporter: createKnownAppsReporter({ client: { post }, logger }), logs };
}

describe('createKnownAppsReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the catalog as soon as it is reported', async () => {
    const { post, reporter } = setup();

    reporter.report([TELEGRAM]);
    await reporter.stop();

    expect(post).toHaveBeenCalledExactlyOnceWith({ items: [TELEGRAM] });
  });

  it('retries with a backoff while the gateway is unreachable, then stops once it answers', async () => {
    const { post, reporter } = setup([
      new IngestRequestError('UNREACHABLE'),
      { status: 503, body: undefined },
    ]);

    reporter.report([TELEGRAM]);
    await vi.advanceTimersByTimeAsync(0);
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
    expect(post).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS * 2);
    expect(post).toHaveBeenCalledTimes(ATTEMPTS_UNTIL_SENT);
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(post).toHaveBeenCalledTimes(ATTEMPTS_UNTIL_SENT);
    await reporter.stop();
  });

  it('drops a catalog the gateway refuses instead of sending it for ever', async () => {
    const { post, reporter, logs } = setup([{ status: 400, body: undefined }]);

    reporter.report([TELEGRAM]);
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(post).toHaveBeenCalledTimes(1);
    expect(logs).toContainEqual(expect.objectContaining({ status: 400 }));
    await reporter.stop();
  });

  it('sends only the latest catalog when a newer one arrives during a send', async () => {
    const { post, reporter } = setup();

    reporter.report([TELEGRAM]);
    reporter.report([TELEGRAM, FILES]);
    await vi.advanceTimersByTimeAsync(0);
    await reporter.stop();

    expect(post.mock.calls.map(([report]) => report.items.length)).toEqual([1, 2]);
  });

  it('holds the catalog while paused and sends it on resume', async () => {
    const { post, reporter } = setup();

    reporter.pause();
    reporter.report([TELEGRAM]);
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);
    expect(post).not.toHaveBeenCalled();
    reporter.resume();
    await reporter.stop();

    expect(post).toHaveBeenCalledExactlyOnceWith({ items: [TELEGRAM] });
  });

  it('cuts a catalog over the contract limit instead of failing', async () => {
    const { post, reporter, logs } = setup();
    const many = Array.from({ length: LIMITS.listSize + 1 }, (_, index) => ({
      ...TELEGRAM,
      appId: `app-${index}`,
    }));

    reporter.report(many);
    await reporter.stop();

    expect(post.mock.calls[0]?.[0].items).toHaveLength(LIMITS.listSize);
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'known apps cut to the limit' }));
  });

  it('sends nothing after stop', async () => {
    const { post, reporter } = setup();

    await reporter.stop();
    reporter.report([TELEGRAM]);

    expect(post).not.toHaveBeenCalled();
  });
});
