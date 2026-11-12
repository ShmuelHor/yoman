import type { KnownAppsReport } from '@yoman/shared/focus';
import { describe, expect, it, vi } from 'vitest';
import { type FetchFn, IngestRequestError } from '../../../src/sender/adapters/ingest-client.js';
import { createKnownAppsClient } from '../../../src/sender/adapters/known-apps-client.js';

const GATEWAY_URL = 'http://127.0.0.1:4711/';
const TOKEN = 'test-agent-token';
const REPORT: KnownAppsReport = {
  items: [{ appId: 'telegram-desktop', name: 'Telegram Desktop', source: 'desktop' }],
};

describe('createKnownAppsClient', () => {
  it('posts the report with the Bearer token to the focus known-apps route and refuses redirects', async () => {
    const fetch = vi.fn<FetchFn>().mockResolvedValue(Response.json({ added: 1 }));
    const client = createKnownAppsClient({ gatewayUrl: GATEWAY_URL, agentToken: TOKEN, fetch });

    const reply = await client.post(REPORT);

    expect(reply).toEqual({ status: 200, body: { added: 1 } });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4711/v1/focus/known-apps',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify(REPORT),
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      }),
    );
  });

  it('maps a network failure to UNREACHABLE and a timeout to TIMEOUT', async () => {
    const down = createKnownAppsClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: vi.fn<FetchFn>().mockRejectedValue(new TypeError('fetch failed')),
    });
    const slow = createKnownAppsClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: vi.fn<FetchFn>().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    });

    await expect(down.post(REPORT)).rejects.toMatchObject({ code: 'UNREACHABLE' });
    await expect(slow.post(REPORT)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects a token that does not fit the header without echoing it', () => {
    const create = (): unknown =>
      createKnownAppsClient({ gatewayUrl: GATEWAY_URL, agentToken: 'bad token\n' });

    expect(create).toThrow(IngestRequestError);
    expect(create).not.toThrow(/bad token/);
  });
});
