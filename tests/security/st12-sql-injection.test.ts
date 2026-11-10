import { createServer } from 'node:net';
import { Writable } from 'node:stream';

import { BatteryNow, HealthTrend, PowerByApp } from '@yoman/shared/battery';
import {
  AlertPolicy,
  AlertQueue,
  FocusState,
  KnownAppList,
  KnownAppsResult,
  Profile,
  ProfileList,
} from '@yoman/shared/focus';
import { Goal, GoalList, GoalProgress } from '@yoman/shared/goals';
import { DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';
import { App, AppList, Rule, RuleList } from '@yoman/shared/sessions';
import { CulpritList, IncidentList, SystemTimeline } from '@yoman/shared/system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SampleResult as BatterySampleResult } from '../../services/battery/src/contracts.js';
import { createBatteryService } from '../../services/battery/src/service.js';
import { FocusTransition, RouteResult, Schedule } from '../../services/focus/src/contracts.js';
import { createFocusService } from '../../services/focus/src/service.js';
import { EvaluateResult } from '../../services/goals/src/contracts.js';
import { createGoalsService } from '../../services/goals/src/service.js';
import { SessionBatchResult, TopAppList } from '../../services/reports/src/contracts.js';
import { createReportsService } from '../../services/reports/src/service.js';
import { SampleResult, SessionList } from '../../services/sessions/src/contracts.js';
import { createSessionsService } from '../../services/sessions/src/service.js';
import { SampleResult as SystemSampleResult } from '../../services/system/src/contracts.js';
import { createSystemService } from '../../services/system/src/service.js';
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
  // `describe(name, { skip })` rather than `describe.skipIf`, so Biome scopes the hooks per suite.
  describe('goals-service', { skip: !available }, () => {
    const SUNDAY = '2026-11-08';
    const MONDAY = '2026-11-09';
    const TARGET_MINUTES = 30;
    const SECONDS_PER_MINUTE = 60;
    const OVER_TARGET_MINUTES = 45;
    const OVER_TARGET_SECONDS = OVER_TARGET_MINUTES * SECONDS_PER_MINUTE;
    const goal = {
      type: 'max',
      target: { kind: 'category', category: 'social' },
      minutes: TARGET_MINUTES,
      days: [0],
    };
    const totals = {
      date: SUNDAY,
      apps: [{ appId: 'org.telegram.desktop', seconds: OVER_TARGET_SECONDS }],
      categories: [{ category: 'social', seconds: OVER_TARGET_SECONDS }],
    };
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createGoalsService> | undefined;
    const logs = captureLogs();

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createGoalsService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          GOALS_DB_PASSWORD: postgres.passwords.goals,
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

    it('rejects injection in every goal field and id', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const bad = [
          { ...goal, type: payload },
          { ...goal, target: { kind: payload, category: 'social' } },
          { ...goal, target: { kind: 'app', appId: payload } },
          { ...goal, target: { kind: 'category', category: payload } },
          { ...goal, minutes: payload },
          { ...goal, days: payload },
          { ...goal, days: [payload] },
        ];
        for (const body of bad) {
          expect((await send('POST', '/goals', body)).status).toBe(HTTP_BAD_REQUEST);
        }
        const badId = `/goals/${encodeURIComponent(payload)}`;
        expect((await send('PUT', badId, goal)).status).toBe(HTTP_BAD_REQUEST);
        expect((await send('DELETE', badId)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('rejects injection in every totals field and in the progress date', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const bad = [
          { ...totals, date: payload },
          { ...totals, apps: [{ appId: payload, seconds: 1 }] },
          { ...totals, apps: [{ appId: 'code', seconds: payload }] },
          { ...totals, categories: [{ category: payload, seconds: 1 }] },
          { ...totals, categories: [{ category: 'social', seconds: payload }] },
        ];
        for (const body of bad) {
          expect((await send('POST', '/evaluate', body)).status).toBe(HTTP_BAD_REQUEST);
        }
        const url = `/progress?date=${encodeURIComponent(payload)}`;
        expect((await send('GET', url)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('still stores, evaluates and reports goals, and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const created = Goal.parse((await send('POST', '/goals', goal)).json);
      const first = EvaluateResult.parse((await send('POST', '/evaluate', totals)).json);
      const again = EvaluateResult.parse((await send('POST', '/evaluate', totals)).json);
      const nextDay = { date: MONDAY, apps: [], categories: [] };
      EvaluateResult.parse((await send('POST', '/evaluate', nextDay)).json);
      const progress = GoalProgress.parse((await send('GET', `/progress?date=${SUNDAY}`)).json);

      expect(GoalList.parse((await send('GET', '/goals')).json).items).toEqual([created]);
      expect(first.breaches.map((alert) => alert.alertKey)).toEqual([
        `goal-breach:${created.id}:${SUNDAY}`,
      ]);
      expect(again.breaches).toEqual([]);
      expect(progress.items).toEqual([
        {
          goalId: created.id,
          minutesUsed: OVER_TARGET_MINUTES,
          targetMinutes: TARGET_MINUTES,
          status: 'breached',
        },
      ]);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });

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
  // `describe(name, { skip })` rather than `describe.skipIf`, so Biome scopes the hooks per suite.
  describe('system-service', { skip: !available }, () => {
    const SECOND_MS = 1_000;
    const SAMPLE_INTERVAL_MS = 5_000;
    const SUSTAINED_SAMPLES = 6;
    const HIGH_CPU = 60;
    const thresholds = { memory: 10, cpu: 40, io: 30 };
    const process = { pid: PID, comm: 'node', cpuPct: 97, rssBytes: 1_000, ioBytesPerSec: 0 };
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createSystemService> | undefined;
    const logs = captureLogs();

    const DAY_MS = 86_400_000;
    const HOUR_MS = 3_600_000;
    /**
     * 01:00 UTC today: inside the 7 days the service keeps samples for, and on
     * one UTC day, the zone the service counts the timeline in by default.
     */
    const BASE_MS = Math.floor(Date.now() / DAY_MS) * DAY_MS + HOUR_MS;
    const TODAY = new Date(BASE_MS).toISOString().slice(0, 'YYYY-MM-DD'.length);

    /** A moment per payload, so every batch is new to the watermarks. */
    function ts(minute: number, offsetMs = 0): string {
      return new Date(BASE_MS + minute * MINUTE_MS + offsetMs).toISOString();
    }

    function pressure(time: string, cpu = 1): object {
      return {
        kind: 'pressure',
        ts: time,
        cpu: { some: cpu, full: 0 },
        memory: { some: 1, full: 0 },
        io: { some: 1, full: 0 },
        memAvailablePct: 50,
        swapActive: false,
      };
    }

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createSystemService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          SYSTEM_DB_PASSWORD: postgres.passwords.system,
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

    it('stores injected process names and containers verbatim as incident culprits', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const [minute, payload] of PAYLOADS.entries()) {
        const run = Array.from({ length: SUSTAINED_SAMPLES }, (_, index) =>
          pressure(ts(minute, index * SAMPLE_INTERVAL_MS), HIGH_CPU),
        );
        const culprits = {
          kind: 'processes',
          ts: ts(minute, SECOND_MS),
          processes: [{ ...process, comm: payload, container: payload }],
        };
        const calm = pressure(ts(minute, SUSTAINED_SAMPLES * SAMPLE_INTERVAL_MS));
        const batch = { thresholds, samples: [...run, culprits, calm] };

        const result = SystemSampleResult.parse((await send('POST', '/samples', batch)).json);
        expect(result.alerts.map((alert) => alert.params)).toMatchObject([
          { comm: stored(payload) },
        ]);
      }
      const range = `from=${ts(0)}&to=${ts(PAYLOADS.length)}`;
      const listed = IncidentList.parse((await send('GET', `/incidents?${range}`)).json);

      expect(listed.items.map((incident) => incident.culprits[0]?.comm)).toEqual(
        PAYLOADS.map(stored),
      );
      expect(listed.items.map((incident) => incident.culprits[0]?.container)).toEqual(
        PAYLOADS.map((payload) => stored(payload).trim()),
      );
    });

    it('rejects injection in every other sample field and in the thresholds', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const time = ts(PAYLOADS.length);
      for (const payload of PAYLOADS) {
        const bad = [
          { thresholds: { ...thresholds, cpu: payload }, samples: [pressure(time)] },
          { thresholds, samples: [{ ...pressure(time), kind: payload }] },
          { thresholds, samples: [{ ...pressure(time), ts: payload }] },
          { thresholds, samples: [{ ...pressure(time), cpu: { some: payload, full: 0 } }] },
          { thresholds, samples: [{ ...pressure(time), swapActive: payload }] },
          {
            thresholds,
            samples: [{ kind: 'processes', ts: time, processes: [{ ...process, pid: payload }] }],
          },
          {
            thresholds,
            samples: [
              { kind: 'processes', ts: time, processes: [{ ...process, cmdline: payload }] },
            ],
          },
          {
            thresholds,
            samples: [{ kind: 'thermal', ts: time, cpuTempC: payload, throttled: false }],
          },
        ];
        for (const body of bad) {
          expect((await send('POST', '/samples', body)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
    });

    it('rejects injection in every query parameter', { timeout: REQUEST_TIMEOUT_MS }, async () => {
      const valid = ts(0);
      for (const payload of PAYLOADS) {
        const value = encodeURIComponent(payload);
        const urls = [
          `/incidents?from=${value}&to=${valid}`,
          `/incidents?from=${valid}&to=${value}`,
          `/culprits?days=${value}`,
          `/timeline?date=${value}`,
        ];
        for (const url of urls) {
          expect((await send('GET', url)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
    });

    it('still ranks culprits and draws the timeline, and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const culprits = CulpritList.parse((await send('GET', '/culprits?days=7')).json);
      const timeline = SystemTimeline.parse((await send('GET', `/timeline?date=${TODAY}`)).json);

      expect(culprits.items).toHaveLength(PAYLOADS.length);
      expect(timeline.incidents).toHaveLength(PAYLOADS.length);
      expect(timeline.points.length).toBeGreaterThan(PAYLOADS.length);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });

  // `describe(name, { skip })` rather than `describe.skipIf`, so Biome scopes the hooks per suite.
  describe('focus-service', { skip: !available }, () => {
    const FOCUS_MINUTES = 60;
    const profileInput = {
      name: 'Deep work',
      mutedApps: ['slack'],
      exceptions: [],
      muteNewApps: false,
    };
    const alert = {
      alertKey: 'thermal:0',
      type: 'thermal',
      level: 'normal',
      ts: '2026-11-08T09:00:00.000Z',
      params: { celsius: 95 },
    };
    let postgres: DisposablePostgres | undefined;
    let service: ReturnType<typeof createFocusService> | undefined;
    const logs = captureLogs();

    beforeAll(async () => {
      postgres = await startPostgres();
      service = createFocusService({
        env: {
          HOST: '127.0.0.1',
          PORT: String(await freePort()),
          DB_HOST: postgres.host,
          DB_PORT: String(postgres.port),
          FOCUS_DB_PASSWORD: postgres.passwords.focus,
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

    it('stores injected profile names verbatim and rejects injection in every other field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const created = Profile.parse(
          (await send('POST', '/profiles', { ...profileInput, name: payload })).json,
        );
        expect(created.name).toBe(stored(payload));
        const updated = await send('PUT', `/profiles/${created.id}`, {
          ...profileInput,
          name: payload,
        });
        expect(Profile.parse(updated.json).name).toBe(stored(payload));
        expect((await send('DELETE', `/profiles/${created.id}`)).status).toBe(HTTP_NO_CONTENT);

        const bad = [
          { ...profileInput, mutedApps: [payload] },
          { ...profileInput, exceptions: [payload] },
          { ...profileInput, muteNewApps: payload },
        ];
        for (const body of bad) {
          expect((await send('POST', '/profiles', body)).status).toBe(HTTP_BAD_REQUEST);
        }
        const badId = `/profiles/${encodeURIComponent(payload)}`;
        expect((await send('PUT', badId, profileInput)).status).toBe(HTTP_BAD_REQUEST);
        expect((await send('DELETE', badId)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('stores injected app names verbatim and rejects injected app ids and sources', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const [index, payload] of PAYLOADS.entries()) {
        const app = { appId: `app${index}`, name: payload, source: 'desktop' };
        const result = KnownAppsResult.parse(
          (await send('POST', '/known-apps', { items: [app] })).json,
        );
        expect(result).toEqual({ added: 1 });

        for (const field of ['appId', 'source']) {
          const bad = { items: [{ ...app, [field]: payload }] };
          expect((await send('POST', '/known-apps', bad)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
      const listed = KnownAppList.parse((await send('GET', '/known-apps')).json).items;
      expect(listed.map((app) => app.name).sort()).toEqual(PAYLOADS.map(stored).sort());
    });

    it('hands injected alert params back verbatim and rejects injection in every other field', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      // In focus, so every normal alert is queued and stored before it comes back.
      FocusTransition.parse((await send('POST', '/start', { minutes: FOCUS_MINUTES })).json);
      for (const [index, payload] of PAYLOADS.entries()) {
        const queued = { ...alert, alertKey: `thermal:${index}`, params: { culprit: payload } };
        const result = RouteResult.parse((await send('POST', '/route', { alerts: [queued] })).json);
        expect(result.queued).toBe(1);

        const bad = [
          ...['alertKey', 'type', 'level', 'ts'].map((field) => ({ ...alert, [field]: payload })),
          { ...alert, params: { [payload]: 1 } },
          { ...alert, params: payload },
        ];
        for (const body of bad) {
          expect((await send('POST', '/route', { alerts: [body] })).status).toBe(HTTP_BAD_REQUEST);
        }
      }
      const queue = AlertQueue.parse((await send('GET', '/queue')).json).items;
      const stopped = FocusTransition.parse((await send('POST', '/stop')).json);

      expect(queue.map((item) => item.alert.params)).toEqual(
        PAYLOADS.map((payload) => ({ culprit: stored(payload) })),
      );
      expect(stopped.summary?.alerts).toEqual(queue);
    });

    it('rejects injection in the focus start and the alert policy', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      for (const payload of PAYLOADS) {
        const starts = [
          { profileId: payload, minutes: 5 },
          { minutes: payload },
          { until: payload },
        ];
        for (const body of starts) {
          expect((await send('POST', '/start', body)).status).toBe(HTTP_BAD_REQUEST);
        }
        const policies = [
          { type: payload, level: 'normal' },
          { type: 'thermal', level: payload },
        ];
        for (const entry of policies) {
          const body = { items: [entry] };
          expect((await send('PUT', '/alert-policy', body)).status).toBe(HTTP_BAD_REQUEST);
        }
      }
    });

    it('rejects injection in every schedule field and id', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const [profile] = ProfileList.parse((await send('GET', '/profiles')).json).items;
      if (profile === undefined) {
        throw new Error('The seeded profile is missing');
      }
      const schedule = {
        profileId: profile.id,
        days: [0],
        start: '09:00',
        end: '12:00',
        enabled: true,
      };
      const created = Schedule.parse((await send('POST', '/schedules', schedule)).json);
      for (const payload of PAYLOADS) {
        for (const field of Object.keys(schedule)) {
          const bad = { ...schedule, [field]: payload };
          expect((await send('POST', '/schedules', bad)).status).toBe(HTTP_BAD_REQUEST);
          const update = await send('PUT', `/schedules/${created.id}`, bad);
          expect(update.status).toBe(HTTP_BAD_REQUEST);
        }
        const badId = `/schedules/${encodeURIComponent(payload)}`;
        expect((await send('PUT', badId, schedule)).status).toBe(HTTP_BAD_REQUEST);
        expect((await send('DELETE', badId)).status).toBe(HTTP_BAD_REQUEST);
      }
    });

    it('still answers every route and logs no database error', {
      timeout: REQUEST_TIMEOUT_MS,
    }, async () => {
      const policy = { items: [{ type: 'thermal', level: 'critical' }] };
      const profiles = ProfileList.parse((await send('GET', '/profiles')).json).items;
      const state = FocusState.parse((await send('GET', '/state')).json);
      const replaced = AlertPolicy.parse((await send('PUT', '/alert-policy', policy)).json);
      const apps = KnownAppList.parse((await send('GET', '/known-apps')).json).items;

      // Only the seeded profile is left: every injected one was deleted again.
      expect(profiles.map((profile) => profile.name)).toEqual(['Default']);
      expect(state).toEqual({ active: false });
      expect(replaced).toEqual(policy);
      expect(apps).toHaveLength(PAYLOADS.length);
      expect(AlertQueue.parse((await send('GET', '/queue')).json).items).toEqual([]);
      expect(logs.output()).not.toContain('DatabaseError');
      expect(logs.output()).not.toContain('Request failed');
    });
  });
});
