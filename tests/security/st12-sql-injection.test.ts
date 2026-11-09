import { createServer } from 'node:net';
import { Writable } from 'node:stream';

import { BatteryNow, HealthTrend, PowerByApp } from '@yoman/shared/battery';
import { App, AppList, Rule, RuleList } from '@yoman/shared/sessions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SampleResult as BatterySampleResult } from '../../services/battery/src/contracts.js';
import { createBatteryService } from '../../services/battery/src/service.js';
import { SampleResult, SessionList } from '../../services/sessions/src/contracts.js';
import { createSessionsService } from '../../services/sessions/src/service.js';
import {
  type DisposablePostgres,
  dockerAvailable,
  startPostgres,
} from './lib/disposable-postgres.js';

const STARTUP_TIMEOUT_MS = 240_000;
const REQUEST_TIMEOUT_MS = 60_000;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;
const PID = 4242;
const MINUTE_MS = 60_000;
/** The default rules the sessions migrations seed; none may be lost. */
const SEEDED_RULES = 14;

/**
 * Classic and Postgres-specific payloads: quote breaking, stacked statements,
 * UNION reads of the catalog, a cast that leaks data through its error,
 * placeholder confusion, LIKE wildcards, a sleep, and a NUL byte, which
 * Postgres `text` rejects outright, so an unhandled one surfaces as a DB error.
 */
const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE sessions; --",
  '"; DROP TABLE apps; --',
  "'); DELETE FROM category_rules; --",
  "' UNION SELECT usename, passwd FROM pg_catalog.pg_shadow --",
  "' AND 1=CAST((SELECT current_user) AS int) --",
  "' || pg_sleep(5) || '",
  '$1',
  '\\',
  '%_%',
  "E'\\x27'",
  "\u0000'; --",
] as const;

/** What a database error or a stack trace looks like when it reaches a client. */
const LEAK =
  /syntax error|SQLSTATE|DatabaseError|relation "|column "|invalid input syntax|\.ts:\d+/i;

/** Free text is stored verbatim, except NUL, which becomes U+FFFD. */
function stored(payload: string): string {
  return payload.replaceAll('\u0000', '�');
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('No TCP address'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

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

function window(minute: number, overrides: Record<string, unknown> = {}): object {
  return {
    kind: 'window',
    ts: new Date(Date.parse('2026-11-08T09:00:00.000Z') + minute * MINUTE_MS).toISOString(),
    wmClass: 'firefox',
    pid: PID,
    idleMs: 0,
    locked: false,
    ...overrides,
  };
}

const available = await dockerAvailable();

describe('ST12 SQL injection', () => {
  describe.skipIf(!available)('sessions-service', () => {
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createSessionsService> | undefined;
    const logs = captureLogs();

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createSessionsService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          SESSIONS_DB_PASSWORD: postgres.passwords.sessions,
          LOG_LEVEL: 'info',
        },
        logStream: logs.stream,
        handleSignals: false,
      });
      // The real migrations, run as the service's own least-privilege role.
      await service.start();
    }, STARTUP_TIMEOUT_MS);

    afterAll(async () => {
      try {
        await service?.stop();
      } finally {
        await postgres?.stop();
      }
    }, STARTUP_TIMEOUT_MS);

    /** Every answer, accepted or rejected, is below 500 and carries no DB detail. */
    async function send(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      payload?: object,
    ): Promise<{ status: number; json: unknown }> {
      if (service === undefined) {
        throw new Error('The service did not start');
      }
      const response = await service.app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
      });
      expect(response.statusCode, `${method} ${url}`).toBeLessThan(HTTP_INTERNAL);
      expect(response.body).not.toMatch(LEAK);
      const json: unknown = response.body === '' ? undefined : JSON.parse(response.body);
      return { status: response.statusCode, json };
    }

    it('stores injected titles verbatim and rejects injection in every other sample field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const closedTitles: (string | undefined)[] = [];
      for (const [minute, payload] of PAYLOADS.entries()) {
        const batch = { samples: [window(minute, { title: payload })] };
        const result = SampleResult.parse((await send('POST', '/samples', batch)).json);
        closedTitles.push(...result.closed.map((closed) => closed.session.title));

        for (const field of ['kind', 'ts', 'wmClass', 'pid', 'idleMs', 'locked']) {
          const bad = { samples: [window(minute, { [field]: payload })] };
          expect((await send('POST', '/samples', bad)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
      const to = new Date(Date.parse('2026-11-08T10:00:00.000Z')).toISOString();
      const listed = await send('GET', `/sessions?from=2026-11-08T00:00:00.000Z&to=${to}`);

      // A minute apart, so each sample closes the previous session; the last one stays open.
      expect(closedTitles).toEqual(PAYLOADS.slice(0, -1).map(stored));
      const titles = SessionList.parse(listed.json).items.map((session) => session.title);
      expect(titles).toEqual(PAYLOADS.map(stored));
    });

    it('rejects injection in the session range', { timeout: REQUEST_TIMEOUT_MS }, async () => {
      const valid = '2026-11-08T00:00:00.000Z';
      for (const payload of PAYLOADS) {
        const value = encodeURIComponent(payload);
        expect((await send('GET', `/sessions?from=${value}&to=${valid}`)).status).toBe(
          HTTP_BAD_REQUEST,
        );
        expect((await send('GET', `/sessions?from=${valid}&to=${value}`)).status).toBe(
          HTTP_BAD_REQUEST,
        );
      }
    });

    it('stores injected app names verbatim and rejects injected ids and categories', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      // The app exists once a sample has named it.
      await send('POST', '/samples', { samples: [window(0)] });
      for (const payload of PAYLOADS) {
        const renamed = await send('PUT', '/apps/firefox', { name: payload, category: null });
        expect(App.parse(renamed.json).name).toBe(stored(payload));

        const badId = `/apps/${encodeURIComponent(payload)}`;
        expect((await send('PUT', badId, { name: 'x', category: null })).status).toBe(
          HTTP_BAD_REQUEST,
        );
        const badCategory = { name: 'Firefox', category: payload };
        expect((await send('PUT', '/apps/firefox', badCategory)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('stores injected rule patterns verbatim and rejects injection in every other field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const rule = {
        field: 'title',
        match: 'contains',
        pattern: 'x',
        category: 'test',
        priority: 1,
      };
      for (const payload of PAYLOADS) {
        const created = Rule.parse(
          (await send('POST', '/rules', { ...rule, pattern: payload })).json,
        );
        expect(created.pattern).toBe(stored(payload));
        const updated = await send('PUT', `/rules/${created.id}`, { ...rule, pattern: payload });
        expect(Rule.parse(updated.json).pattern).toBe(stored(payload));
        expect((await send('DELETE', `/rules/${created.id}`)).status).toBe(HTTP_NO_CONTENT);

        for (const field of ['field', 'match', 'category', 'priority']) {
          const bad = { ...rule, [field]: payload };
          expect((await send('POST', '/rules', bad)).status).toBe(HTTP_BAD_REQUEST);
        }
        const badId = `/rules/${encodeURIComponent(payload)}`;
        expect((await send('PUT', badId, rule)).status).toBe(HTTP_BAD_REQUEST);
        expect((await send('DELETE', badId)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('leaves every table intact and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const rules = RuleList.parse((await send('GET', '/rules')).json).items;
      const apps = AppList.parse((await send('GET', '/apps')).json).items;

      expect(rules).toHaveLength(SEEDED_RULES);
      expect(apps.map((app) => app.id)).toEqual(['firefox']);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });

  it.todo(
    '[T14] reports-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  it.todo(
    '[T15] goals-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  // `describe(name, { skip })` rather than `describe.skipIf`, so Biome scopes the hooks per suite.
  describe('battery-service', { skip: !available }, () => {
    const sample = {
      kind: 'battery',
      ts: '2026-11-08T09:00:00.000Z',
      energyFullWh: 54,
      energyFullDesignWh: 60,
      cycleCount: 312,
      powerW: 10,
      capacityPct: 50,
      status: 'discharging',
    };
    const range = { from: '2026-11-08T09:00:00.000Z', to: '2026-11-08T10:00:00.000Z' };
    const session = {
      appId: 'code',
      start: '2026-11-08T08:30:00.000Z',
      end: '2026-11-08T09:30:00.000Z',
    };
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createBatteryService> | undefined;
    const logs = captureLogs();

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createBatteryService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          BATTERY_DB_PASSWORD: postgres.passwords.battery,
          LOG_LEVEL: 'info',
        },
        logStream: logs.stream,
        handleSignals: false,
      });
      // The real migrations, run as the service's own least-privilege role.
      await service.start();
    }, STARTUP_TIMEOUT_MS);

    afterAll(async () => {
      try {
        await service?.stop();
      } finally {
        await postgres?.stop();
      }
    }, STARTUP_TIMEOUT_MS);

    /** Every answer, accepted or rejected, is below 500 and carries no DB detail. */
    async function send(
      method: 'GET' | 'POST',
      url: string,
      payload?: object,
    ): Promise<{ status: number; json: unknown }> {
      if (service === undefined) {
        throw new Error('The service did not start');
      }
      const response = await service.app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
      });
      expect(response.statusCode, `${method} ${url}`).toBeLessThan(HTTP_INTERNAL);
      expect(response.body).not.toMatch(LEAK);
      const json: unknown = response.body === '' ? undefined : JSON.parse(response.body);
      return { status: response.statusCode, json };
    }

    it('rejects injection in every sample field', { timeout: REQUEST_TIMEOUT_MS }, async () => {
      for (const payload of PAYLOADS) {
        for (const field of Object.keys(sample)) {
          const bad = { samples: [{ ...sample, [field]: payload }] };
          expect((await send('POST', '/samples', bad)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
    });

    it('rejects injection in the trend length and in every power-by-app field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const days = `/health-trend?days=${encodeURIComponent(payload)}`;
        expect((await send('GET', days)).status).toBe(HTTP_BAD_REQUEST);

        const bad = [
          { ...range, from: payload, sessions: [session] },
          { ...range, to: payload, sessions: [session] },
          { ...range, sessions: payload },
          ...Object.keys(session).map((field) => ({
            ...range,
            sessions: [{ ...session, [field]: payload }],
          })),
        ];
        for (const body of bad) {
          expect((await send('POST', '/power-by-app', body)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
    });

    it('still stores samples and answers every route, and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const stored = BatterySampleResult.parse(
        (await send('POST', '/samples', { samples: [sample] })).json,
      );
      const now = BatteryNow.parse((await send('GET', '/now')).json);
      // The fixture day falls out of any window once it is a year old, so only the shape is checked.
      HealthTrend.parse((await send('GET', '/health-trend?days=365')).json);
      const power = PowerByApp.parse(
        (await send('POST', '/power-by-app', { ...range, sessions: [session] })).json,
      );

      expect(stored.accepted).toBe(1);
      expect(now.ts).toBe(sample.ts);
      expect(power.items.map((item) => item.appId)).toEqual(['code']);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });
  it.todo(
    '[T17] system-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  it.todo(
    '[T18] focus-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
});
