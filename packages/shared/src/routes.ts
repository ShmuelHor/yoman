import type { z } from 'zod';
import { BatteryNow, HealthTrend, HealthTrendQuery, PowerByApp } from './battery.js';
import { AppIdParams, DateQuery, IdParams, TimeRangeQuery } from './common.js';
import {
  AlertPolicy,
  AlertQueue,
  FocusChange,
  FocusStart,
  FocusState,
  KnownAppList,
  KnownAppsReport,
  KnownAppsResult,
  Profile,
  ProfileInput,
  ProfileList,
} from './focus.js';
import { DashboardToday, ExportBundle, ExportQuery, WebSession } from './gateway.js';
import { IngestBatch, IngestResult } from './ingest.js';
import { WeekQuery, WeekReport } from './reports.js';
import { App, AppList, AppUpdate, Rule, RuleInput, RuleList } from './sessions.js';
import { Settings } from './settings.js';
import { CulpritList, CulpritsQuery, IncidentList, SystemTimeline } from './system.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Who may call a route (SPEC §5 gateway, SECURITY A5):
 * - `agent`: `Authorization: Bearer <AGENT_TOKEN>`
 * - `session`: the web's session cookie, plus the CSRF token on writes
 * - `either`: the agent (CLI and tray) or the web
 * - `origin`: no credential yet; only the allowed web origins. Only `GET /v1/session`
 */
export type RouteAuth = 'agent' | 'session' | 'either' | 'origin';

export type SuccessStatus = 200 | 201 | 204;

export interface RouteContract {
  readonly method: HttpMethod;
  /** Fastify and MSW syntax: `:id` marks a path parameter. */
  readonly path: `/v1/${string}`;
  readonly auth: RouteAuth;
  readonly status: SuccessStatus;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  /** `null` when the route answers `204 No Content`. */
  readonly response: z.ZodType | null;
}

/**
 * Every public gateway endpoint. ST03 (authentication) and ST08 (fuzzing) iterate
 * over this map, so a route added here is covered by both automatically.
 */
export const routes = {
  session: {
    method: 'GET',
    path: '/v1/session',
    auth: 'origin',
    status: 200,
    response: WebSession,
  },
  ingest: {
    method: 'POST',
    path: '/v1/ingest',
    auth: 'agent',
    status: 200,
    body: IngestBatch,
    response: IngestResult,
  },
  dashboardToday: {
    method: 'GET',
    path: '/v1/dashboard/today',
    auth: 'session',
    status: 200,
    response: DashboardToday,
  },
  week: {
    method: 'GET',
    path: '/v1/week',
    auth: 'session',
    status: 200,
    query: WeekQuery,
    response: WeekReport,
  },

  listApps: { method: 'GET', path: '/v1/apps', auth: 'session', status: 200, response: AppList },
  updateApp: {
    method: 'PUT',
    path: '/v1/apps/:id',
    auth: 'session',
    status: 200,
    params: AppIdParams,
    body: AppUpdate,
    response: App,
  },

  listRules: { method: 'GET', path: '/v1/rules', auth: 'session', status: 200, response: RuleList },
  createRule: {
    method: 'POST',
    path: '/v1/rules',
    auth: 'session',
    status: 201,
    body: RuleInput,
    response: Rule,
  },
  updateRule: {
    method: 'PUT',
    path: '/v1/rules/:id',
    auth: 'session',
    status: 200,
    params: IdParams,
    body: RuleInput,
    response: Rule,
  },
  deleteRule: {
    method: 'DELETE',
    path: '/v1/rules/:id',
    auth: 'session',
    status: 204,
    params: IdParams,
    response: null,
  },

  batteryNow: {
    method: 'GET',
    path: '/v1/battery/now',
    auth: 'session',
    status: 200,
    /** `null` on a device without a battery. */
    response: BatteryNow.nullable(),
  },
  batteryHealthTrend: {
    method: 'GET',
    path: '/v1/battery/health-trend',
    auth: 'session',
    status: 200,
    query: HealthTrendQuery,
    response: HealthTrend,
  },
  batteryPowerByApp: {
    method: 'GET',
    path: '/v1/battery/power-by-app',
    auth: 'session',
    status: 200,
    query: TimeRangeQuery,
    response: PowerByApp,
  },

  systemIncidents: {
    method: 'GET',
    path: '/v1/system/incidents',
    auth: 'session',
    status: 200,
    query: TimeRangeQuery,
    response: IncidentList,
  },
  systemCulprits: {
    method: 'GET',
    path: '/v1/system/culprits',
    auth: 'session',
    status: 200,
    query: CulpritsQuery,
    response: CulpritList,
  },
  systemTimeline: {
    method: 'GET',
    path: '/v1/system/timeline',
    auth: 'session',
    status: 200,
    query: DateQuery,
    response: SystemTimeline,
  },

  focusStart: {
    method: 'POST',
    path: '/v1/focus/start',
    auth: 'either',
    status: 200,
    body: FocusStart,
    response: FocusChange,
  },
  focusStop: {
    method: 'POST',
    path: '/v1/focus/stop',
    auth: 'either',
    status: 200,
    response: FocusChange,
  },
  focusState: {
    method: 'GET',
    path: '/v1/focus/state',
    auth: 'either',
    status: 200,
    response: FocusState,
  },
  listProfiles: {
    method: 'GET',
    path: '/v1/focus/profiles',
    auth: 'session',
    status: 200,
    response: ProfileList,
  },
  createProfile: {
    method: 'POST',
    path: '/v1/focus/profiles',
    auth: 'session',
    status: 201,
    body: ProfileInput,
    response: Profile,
  },
  updateProfile: {
    method: 'PUT',
    path: '/v1/focus/profiles/:id',
    auth: 'session',
    status: 200,
    params: IdParams,
    body: ProfileInput,
    response: Profile,
  },
  deleteProfile: {
    method: 'DELETE',
    path: '/v1/focus/profiles/:id',
    auth: 'session',
    status: 204,
    params: IdParams,
    response: null,
  },
  focusQueue: {
    method: 'GET',
    path: '/v1/focus/queue',
    auth: 'session',
    status: 200,
    response: AlertQueue,
  },
  listKnownApps: {
    method: 'GET',
    path: '/v1/focus/known-apps',
    auth: 'session',
    status: 200,
    response: KnownAppList,
  },
  reportKnownApps: {
    method: 'POST',
    path: '/v1/focus/known-apps',
    auth: 'agent',
    status: 200,
    body: KnownAppsReport,
    response: KnownAppsResult,
  },
  getAlertPolicy: {
    method: 'GET',
    path: '/v1/focus/alert-policy',
    auth: 'session',
    status: 200,
    response: AlertPolicy,
  },
  updateAlertPolicy: {
    method: 'PUT',
    path: '/v1/focus/alert-policy',
    auth: 'session',
    status: 200,
    body: AlertPolicy,
    response: AlertPolicy,
  },

  export: {
    method: 'GET',
    path: '/v1/export',
    auth: 'session',
    status: 200,
    query: ExportQuery,
    response: ExportBundle,
  },
  getSettings: {
    method: 'GET',
    path: '/v1/settings',
    auth: 'either',
    status: 200,
    response: Settings,
  },
  updateSettings: {
    method: 'PUT',
    path: '/v1/settings',
    auth: 'session',
    status: 200,
    body: Settings,
    response: Settings,
  },
} as const satisfies Record<string, RouteContract>;

export type RouteName = keyof typeof routes;
