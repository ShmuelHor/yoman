import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createLogger } from '../../apps/agent/src/core/logger.js';
import { createService } from '../../packages/service-kit/src/create-service.js';
import { defineRoute } from '../../packages/service-kit/src/route.js';

const TOKEN_BYTES = 32;

// Distinctive markers, so a match can only mean a leak.
const TOKEN = 'st11-token-7c1e9b2a';
const TITLE = 'ST11 Secret Window Title 51f0';
const COOKIE = 'st11-cookie-3d8a';
const CMDLINE = '/usr/bin/st11 --password=st11-cmdline-9e2f';

function captureLogs(): { output: () => string; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      lines.push(chunk.toString());
      done();
    },
  });
  return { output: (): string => lines.join(''), stream };
}

const sample = z.object({ wmClass: z.string(), title: z.string().optional() });

function buildService(stream: Writable): ReturnType<typeof createService> {
  return createService({
    name: 'st11',
    migrationsDir: '.',
    env: { ST11_DB_PASSWORD: 'st11-db-password', LOG_LEVEL: 'trace' },
    logStream: stream,
    handleSignals: false,
    routes: [
      defineRoute({
        method: 'POST',
        url: '/samples',
        schema: { body: z.object({ samples: z.array(sample) }), response: z.object({}) },
        handler: ({ body, log }) => {
          // A careless handler logging the whole payload must still not leak.
          log.info({ body, token: TOKEN, process: { cmdline: CMDLINE } }, 'Samples received');
          return {};
        },
      }),
      defineRoute({
        method: 'GET',
        url: '/fails',
        schema: { response: z.unknown() },
        handler: () => {
          const error = new pg.DatabaseError(`value "${TITLE}" violates a constraint`, 0, 'error');
          error.code = '23505';
          error.detail = `Key (title)=(${TITLE}) already exists.`;
          throw error;
        },
      }),
    ],
  });
}

describe('ST11 log redaction', () => {
  it('[T09] service-kit logs never contain an injected token or window title', async () => {
    const logs = captureLogs();
    const service = buildService(logs.stream);
    try {
      const headers = { authorization: `Bearer ${TOKEN}`, cookie: `yoman_session=${COOKIE}` };
      await service.app.inject({
        method: 'POST',
        url: `/samples?token=${TOKEN}&title=${encodeURIComponent(TITLE)}`,
        headers,
        payload: { samples: [{ wmClass: 'firefox', title: TITLE }] },
      });
      await service.app.inject({ method: 'GET', url: '/fails', headers });
      // Rejected input is a second path into the logs.
      await service.app.inject({
        method: 'POST',
        url: '/samples',
        headers,
        payload: { samples: [{ wmClass: 1, title: TITLE }] },
      });
    } finally {
      await service.stop();
    }

    const output = logs.output();
    // The run really logged requests and the failure, so the absence below means something.
    expect(output).toContain('Samples received');
    expect(output).toContain('23505');
    const leaks = [
      TOKEN,
      TITLE,
      encodeURIComponent(TITLE),
      COOKIE,
      'st11-cmdline-9e2f',
      'st11-db-password',
    ];
    for (const secret of leaks) {
      expect(output).not.toContain(secret);
    }
  });

  it('[T12] agent logs never contain an injected token or window title', () => {
    // Built at runtime so no token-shaped literal is ever committed.
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const title = `Bank statement ${randomBytes(TOKEN_BYTES).toString('hex')}`;
    const lines: string[] = [];
    const logger = createLogger({
      level: 'trace',
      destination: { write: (line: string): void => void lines.push(line) },
    });

    logger.info(
      { headers: { authorization: `Bearer ${token}`, cookie: `sid=${token}` } },
      'ingest',
    );
    logger.info({ token, password: token }, 'config');
    logger.debug({ sample: { kind: 'window', wmClass: 'firefox', title } }, 'sampled');
    logger.warn({ batch: { samples: [{ kind: 'window', title }] } }, 'send failed');
    logger.trace({ process: { comm: 'node', cmdline: `node --token=${token}` } }, 'process');
    logger.error({ windows: [{ meta: { title } }] }, 'window list');

    const output = lines.join('');
    expect(lines.length).toBeGreaterThan(0);
    expect(output).not.toContain(token);
    expect(output).not.toContain(title);
    expect(output).toContain('firefox');
  });
});
