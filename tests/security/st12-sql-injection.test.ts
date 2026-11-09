import { createServer } from 'node:net';
import { Writable } from 'node:stream';

import { DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';
import { App, AppList, Rule, RuleList } from '@yoman/shared/sessions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionBatchResult, TopAppList } from '../../services/reports/src/contracts.js';
import { createReportsService } from '../../services/reports/src/service.js';
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
const MS_PER_SECOND = 1_000;
const UUID_NODE_LENGTH = 12;
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

  describe('reports-service', { skip: !available }, () => {
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createReportsService> | undefined;
    const logs = captureLogs();

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createReportsService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          REPORTS_DB_PASSWORD: postgres.passwords.reports,
          TZ: 'Asia/Jerusalem',
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
      return { status: response.statusCode, json: JSON.parse(response.body) };
    }

    /** One closed session per minute from 09:00, each with its own id. */
    function closed(minute: number, overrides: Record<string, unknown> = {}): object {
      const start = Date.parse('2026-11-08T09:00:00.000Z') + minute * MINUTE_MS;
      return {
        session: {
          id: `00000000-0000-4000-8000-${String(minute).padStart(UUID_NODE_LENGTH, '0')}`,
          appId: 'code',
          start: new Date(start).toISOString(),
          end: new Date(start + MINUTE_MS).toISOString(),
          ...overrides,
        },
        category: minute % 2 === 0 ? 'work' : null,
      };
    }

    it('counts injected titles as plain sessions and rejects injection in every other field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const [minute, payload] of PAYLOADS.entries()) {
        const batch = { sessions: [closed(minute, { title: payload })] };
        const result = SessionBatchResult.parse((await send('POST', '/sessions', batch)).json);
        expect(result).toEqual({ counted: 1, duplicates: 0 });

        for (const field of ['id', 'appId', 'start', 'end']) {
          const bad = { sessions: [closed(minute, { [field]: payload })] };
          expect((await send('POST', '/sessions', bad)).status).toBe(HTTP_BAD_REQUEST);
        }
        const badCategory = { sessions: [{ ...closed(minute), category: payload }] };
        expect((await send('POST', '/sessions', badCategory)).status).toBe(HTTP_BAD_REQUEST);
      }
      // A retry of the whole run is recognized, uncategorized rows included.
      const retry = { sessions: PAYLOADS.map((_payload, minute) => closed(minute)) };
      const result = SessionBatchResult.parse((await send('POST', '/sessions', retry)).json);
      expect(result).toEqual({ counted: 0, duplicates: PAYLOADS.length });
    });

    it('rejects injection in the week and the top-apps range', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const value = encodeURIComponent(payload);
        expect((await send('GET', `/week?start=${value}`)).status).toBe(HTTP_BAD_REQUEST);
        expect((await send('GET', `/top-apps?from=${value}&to=2026-11-09`)).status).toBe(
          HTTP_BAD_REQUEST,
        );
        expect((await send('GET', `/top-apps?from=2026-11-08&to=${value}`)).status).toBe(
          HTTP_BAD_REQUEST,
        );
      }
    });

    it('still reports every counted minute and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const week = WeekReport.parse((await send('GET', '/week?start=2026-11-08')).json);
      const top = await send('GET', '/top-apps?from=2026-11-08&to=2026-11-09');
      DayReport.parse((await send('GET', '/today')).json);
      WeeklySummary.parse((await send('GET', '/weekly-summary')).json);

      const countedSeconds = (PAYLOADS.length * MINUTE_MS) / MS_PER_SECOND;
      expect(week.days[0]?.totalSeconds).toBe(countedSeconds);
      // Work and uncategorized minutes alternate, and a one-minute interruption does not end a
      // streak, so the batches joined into one streak from the first work minute to the last.
      const workMinutes = PAYLOADS.flatMap((_payload, minute) =>
        minute % 2 === 0 ? [minute] : [],
      );
      const streakMs = (Math.max(...workMinutes) + 1) * MINUTE_MS;
      expect(week.days[0]?.longestFocusStreakSeconds).toBe(streakMs / MS_PER_SECOND);
      expect(TopAppList.parse(top.json).items).toEqual([
        { appId: 'code', seconds: countedSeconds },
      ]);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });
  it.todo(
    '[T15] goals-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  it.todo(
    '[T16] battery-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  it.todo(
    '[T17] system-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
  it.todo(
    '[T18] focus-service: SQL injection payloads in every parameter cause no DB error and no leak',
  );
});
