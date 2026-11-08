import type { z } from 'zod';
import type { RouteName, routes } from '../routes.js';
import {
  alertFixture,
  appFixture,
  batteryNowFixture,
  dayReportFixture,
  FIXTURE_DATE,
  FIXTURE_NOW,
  focusActiveFixture,
  goalFixture,
  incidentFixture,
  profileFixture,
  ruleFixture,
  sessionFixture,
  settingsFixture,
} from './data.js';

type ResponseOf<K extends RouteName> = (typeof routes)[K]['response'] extends z.ZodType
  ? z.infer<(typeof routes)[K]['response']>
  : null;

export type ResponseFixtures = { readonly [K in RouteName]: ResponseOf<K> };

const weekDays = ['02', '03', '04', '05', '06', '07', '08'].map((day) => ({
  ...dayReportFixture,
  date: `2026-11-${day}`,
}));

/** One valid response for every route in the map; MSW serves these. */
export const responseFixtures: ResponseFixtures = {
  session: { csrfToken: 'fixture-csrf-token-not-a-secret-0000000000', expiresAt: FIXTURE_NOW },
  ingest: { accepted: 12, deliver: [alertFixture], queued: 0, degraded: [] },
  dashboardToday: {
    data: {
      reports: dayReportFixture,
      battery: batteryNowFixture,
      openIncidents: { items: [] },
      focus: focusActiveFixture,
    },
    degraded: [],
  },
  week: {
    start: '2026-11-02',
    days: weekDays,
    topApps: dayReportFixture.topApps,
    summary: { totalSeconds: 113_400, changePct: -8.5, topCategory: 'work' },
  },
  listApps: {
    items: [
      appFixture,
      { id: 'firefox', name: 'Firefox', icon: 'firefox', category: 'browsing' },
      { id: 'slack', name: 'Slack', icon: 'slack', category: 'social' },
    ],
  },
  updateApp: appFixture,
  listRules: { items: [ruleFixture] },
  createRule: ruleFixture,
  updateRule: ruleFixture,
  deleteRule: null,
  listGoals: { items: [goalFixture] },
  createGoal: goalFixture,
  updateGoal: goalFixture,
  deleteGoal: null,
  goalProgress: {
    date: FIXTURE_DATE,
    items: [{ goalId: goalFixture.id, minutesUsed: 45, targetMinutes: 30, status: 'breached' }],
  },
  batteryNow: batteryNowFixture,
  batteryHealthTrend: {
    items: [
      { date: '2026-11-07', healthPct: 86.5, cycles: 311, averageW: 7.9 },
      { date: FIXTURE_DATE, healthPct: 86.4, cycles: 312, averageW: 8.2 },
    ],
  },
  batteryPowerByApp: {
    items: [
      { appId: 'firefox', averageW: 11.3, seconds: 4_500 },
      { appId: 'code', averageW: 7.1, seconds: 9_000 },
    ],
  },
  systemIncidents: { items: [incidentFixture] },
  systemCulprits: { items: [{ comm: 'node', container: 'yoman-web-1', incidents: 3 }] },
  systemTimeline: {
    date: FIXTURE_DATE,
    points: [
      { ts: '2026-11-08T08:12:00.000Z', cpu: 4.2, memory: 27.5, io: 1.1 },
      { ts: '2026-11-08T08:12:05.000Z', cpu: 3.9, memory: 24.0, io: 0.8 },
    ],
    incidents: [incidentFixture],
  },
  focusStart: {
    state: focusActiveFixture,
    commands: { mute: profileFixture.mutedApps, restore: [] },
  },
  focusStop: {
    state: { active: false },
    commands: { mute: [], restore: profileFixture.mutedApps },
  },
  focusState: focusActiveFixture,
  listProfiles: { items: [profileFixture] },
  createProfile: profileFixture,
  updateProfile: profileFixture,
  deleteProfile: null,
  focusQueue: { items: [{ alert: alertFixture, queuedAt: FIXTURE_NOW }] },
  listKnownApps: {
    items: [
      { appId: 'slack', name: 'Slack', source: 'desktop' },
      { appId: 'discord', name: null, source: 'gsettings' },
    ],
  },
  reportKnownApps: { added: 1 },
  getAlertPolicy: {
    items: [
      { type: 'battery-critical', level: 'critical' },
      { type: 'battery-low', level: 'important' },
      { type: 'goal-breach', level: 'normal' },
    ],
  },
  updateAlertPolicy: { items: [{ type: 'battery-low', level: 'critical' }] },
  export: {
    exportedAt: FIXTURE_NOW,
    from: '2026-11-01',
    to: FIXTURE_DATE,
    settings: settingsFixture,
    apps: { items: [appFixture] },
    rules: { items: [ruleFixture] },
    goals: { items: [goalFixture] },
    sessions: [sessionFixture],
  },
  getSettings: settingsFixture,
  updateSettings: settingsFixture,
};
