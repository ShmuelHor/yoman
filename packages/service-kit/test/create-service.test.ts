import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createService } from '../src/create-service.js';
import { defineRoute } from '../src/route.js';

/** Port 1 on loopback refuses at once, so nothing waits for a timeout. */
const env = {
  DEMO_DB_PASSWORD: 'not-a-real-secret',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
  PORT: '18999',
  GREETING: 'hello',
};

function sink(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

describe('createService', () => {
  it('builds routes from typed config and dependencies', async () => {
    const service = createService({
      name: 'demo',
      migrationsDir: '/nonexistent',
      env,
      config: z.object({ GREETING: z.string() }),
      logStream: sink().stream,
      routes: ({ config }) => [
        defineRoute({
          method: 'GET',
          url: '/greeting',
          schema: { response: z.object({ text: z.string() }) },
          handler: () => ({ text: config.service.GREETING }),
        }),
      ],
    });
    const response = await service.app.inject({ method: 'GET', url: '/greeting' });
    expect(response.json()).toEqual({ text: 'hello' });
    const health = await service.app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toMatchObject({ status: 'unavailable' });
    await service.stop();
    await service.stop();
  });

  it('fails to start when the database is unreachable, logs and releases everything', async () => {
    const { lines, stream } = sink();
    const dir = await mkdtemp(join(tmpdir(), 'service-kit-'));
    const service = createService({
      name: 'demo',
      migrationsDir: dir,
      env,
      routes: [],
      logStream: stream,
      handleSignals: false,
    });
    await expect(service.start()).rejects.toThrow();
    const fatal = lines.map((line) => JSON.parse(line) as { level: number; msg: string });
    expect(fatal.some((line) => line.msg === 'Service failed to start')).toBe(true);
    expect(lines.join('')).not.toContain('not-a-real-secret');
    expect(service.db.ending).toBe(true);
  });

  it('rejects a bad environment before creating anything', () => {
    expect(() => createService({ name: 'demo', migrationsDir: '.', env: {}, routes: [] })).toThrow(
      /DEMO_DB_PASSWORD/,
    );
  });
});
