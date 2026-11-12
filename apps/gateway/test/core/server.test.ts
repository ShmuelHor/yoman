import { createServer } from 'node:net';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { ConnectDatabase } from '../../src/core/database.js';
import { startGateway } from '../../src/core/server.js';
import { AGENT_TOKEN, GATEWAY_DB_PASSWORD, GATEWAY_HOST, STATUS } from '../harness.js';

function capture(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      chunks.push(chunk.toString());
      done();
    },
  });
  return { stream, output: () => chunks.join('') };
}

/** A port that was free a moment ago: the config, like Compose, needs a real one. */
function freePort(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(String(port)));
    });
  });
}

const testEnv = async (): Promise<Record<string, string>> => ({
  AGENT_TOKEN,
  GATEWAY_DB_PASSWORD,
  PORT: await freePort(),
  LOG_LEVEL: 'info',
});
/** A database that connects to nothing; `close` is observable. */
function stubDatabase(): { connect: ConnectDatabase; close: () => Promise<void> } {
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const connect: ConnectDatabase = () => Promise.resolve({ pool: new pg.Pool(), close });
  return { connect, close };
}
const noRoutes = join(import.meta.dirname, 'no-such-routes-dir');

describe('startGateway', () => {
  it('listens on loopback and serves the health check', async () => {
    const logs = capture();
    const database = stubDatabase();
    const gateway = await startGateway({
      env: await testEnv(),
      routesDir: noRoutes,
      connectDatabase: database.connect,
      logStream: logs.stream,
      handleSignals: false,
    });
    try {
      const response = await gateway.app.inject({
        method: 'GET',
        url: '/health',
        headers: { host: GATEWAY_HOST },
      });

      expect(response.statusCode).toBe(STATUS.OK);
      expect(gateway.app.server.address()).toMatchObject({ address: '127.0.0.1' });
    } finally {
      await gateway.stop();
      await gateway.stop();
    }
    expect(logs.output()).not.toContain(AGENT_TOKEN);
    expect(logs.output()).not.toContain(GATEWAY_DB_PASSWORD);
    expect(database.close).toHaveBeenCalledOnce();
  });

  it('fails on an invalid environment without echoing it', async () => {
    await expect(
      startGateway({ env: { AGENT_TOKEN: 'short' }, routesDir: noRoutes }),
    ).rejects.toThrow('Invalid environment configuration: AGENT_TOKEN');
  });

  it('logs and rethrows when it cannot start', async () => {
    const logs = capture();
    const routesDir = join(import.meta.dirname, 'route-loader.test.ts');
    const database = stubDatabase();

    await expect(
      startGateway({
        env: await testEnv(),
        routesDir,
        connectDatabase: database.connect,
        logStream: logs.stream,
        handleSignals: false,
      }),
    ).rejects.toThrow();
    expect(logs.output()).toContain('Gateway failed to start');
    expect(database.close).toHaveBeenCalledOnce();
  });
});
