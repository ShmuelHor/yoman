import type { RouteName } from '../routes.js';
import {
  appFixture,
  FIXTURE_DATE,
  FIXTURE_IDS,
  profileFixture,
  ruleFixture,
  settingsFixture,
  windowSampleFixture,
} from './data.js';

export interface RequestFixture {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

const { id: _ruleId, ...ruleInput } = ruleFixture;
const { id: _profileId, ...profileInput } = profileFixture;
const range = { from: '2026-11-01T00:00:00.000Z', to: '2026-11-08T00:00:00.000Z' };

/** One valid request for every route: path params, query string and body. */
export const requestFixtures: { readonly [K in RouteName]: RequestFixture } = {
  session: {},
  ingest: { body: { agentVersion: '0.1.0', samples: [windowSampleFixture] } },
  dashboardToday: {},
  week: { query: { start: '2026-11-02' } },
  listApps: {},
  updateApp: { params: { id: appFixture.id }, body: { name: 'Code', category: 'work' } },
  listRules: {},
  createRule: { body: ruleInput },
  updateRule: { params: { id: FIXTURE_IDS.rule }, body: ruleInput },
  deleteRule: { params: { id: FIXTURE_IDS.rule } },
  batteryNow: {},
  batteryHealthTrend: { query: { days: '30' } },
  batteryPowerByApp: { query: range },
  systemIncidents: { query: range },
  systemCulprits: { query: { days: '7' } },
  systemTimeline: { query: { date: FIXTURE_DATE } },
  focusStart: { body: { profileId: FIXTURE_IDS.profile, minutes: 50 } },
  focusStop: {},
  focusState: {},
  listProfiles: {},
  createProfile: { body: profileInput },
  updateProfile: { params: { id: FIXTURE_IDS.profile }, body: profileInput },
  deleteProfile: { params: { id: FIXTURE_IDS.profile } },
  focusQueue: {},
  listKnownApps: {},
  reportKnownApps: { body: { items: [{ appId: 'slack', name: 'Slack', source: 'desktop' }] } },
  getAlertPolicy: {},
  updateAlertPolicy: { body: { items: [{ type: 'battery-low', level: 'critical' }] } },
  export: { query: { from: '2026-11-01', to: FIXTURE_DATE } },
  getSettings: {},
  updateSettings: { body: settingsFixture },
};
