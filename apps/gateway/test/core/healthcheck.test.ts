import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { STATUS } from '../harness.js';

const run = promisify(execFile);
const PROBE = fileURLToPath(new URL('../../src/core/healthcheck.ts', import.meta.url));
/** Starting tsx in a child process takes longer than Vitest's 5 s default on a cold CI runner. */
const PROBE_TIMEOUT_MS = 30_000;

interface ProbeResult {
  readonly exitCode: number;
  readonly hosts: readonly (string | undefined)[];
}

describe('healthcheck', { timeout: PROBE_TIMEOUT_MS }, () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
    server = undefined;
  });

  async function probeAgainst(status: number): Promise<ProbeResult> {
    const hosts: (string | undefined)[] = [];
    server = createServer((request, response) => {
      hosts.push(request.headers.host);
      response.writeHead(request.url === '/health' ? status : STATUS.NOT_FOUND).end();
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const { PATH = '' } = process.env;
    const env = { PATH, PORT: String(port) };
    try {
      await run(process.execPath, ['--import', 'tsx', PROBE], { env });
      return { exitCode: 0, hosts };
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : -1;
      return { exitCode: typeof code === 'number' ? code : -1, hosts };
    }
  }

  it('exits 0 on a 200 and names the public gateway host', async () => {
    const result = await probeAgainst(STATUS.OK);

    expect(result).toEqual({ exitCode: 0, hosts: ['127.0.0.1:4711'] });
  });

  it('exits 1 when the gateway is unhealthy', async () => {
    const result = await probeAgainst(STATUS.UNAVAILABLE);

    expect(result.exitCode).toBe(1);
  });
});
