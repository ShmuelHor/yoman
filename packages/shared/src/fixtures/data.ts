import type { Alert } from '../alerts.js';
import type { BatteryNow } from '../battery.js';
import type { FocusState, Profile } from '../focus.js';
import type { WindowSample } from '../ingest.js';
import type { DayReport } from '../reports.js';
import type { App, Rule, Session } from '../sessions.js';
import type { Settings } from '../settings.js';
import type { Incident } from '../system.js';

/** Realistic, contract-valid sample data for tests, MSW and the web's demo mode. */
export const FIXTURE_IDS = {
  rule: '6f1c2a9e-1b3d-4c5e-8f70-9a1b2c3d4e5f',
  profile: '8b3e4c1a-3d5f-4e70-a192-bc3d4e5f6071',
  incident: '9c4f5d2b-4e60-4f81-b2a3-cd4e5f607182',
  session: 'ad506e3c-5f71-4092-83b4-de5f60718293',
} as const;

export const FIXTURE_DATE = '2026-11-08';
export const FIXTURE_NOW = '2026-11-08T10:00:00.000Z';

export const appFixture: App = {
  id: 'code',
  name: 'Visual Studio Code',
  icon: 'vscode',
  category: 'work',
};

export const ruleFixture: Rule = {
  id: FIXTURE_IDS.rule,
  field: 'wmClass',
  match: 'exact',
  pattern: 'code',
  category: 'work',
  priority: 10,
};

export const profileFixture: Profile = {
  id: FIXTURE_IDS.profile,
  name: 'Deep work',
  mutedApps: ['slack', 'discord'],
  exceptions: ['org.gnome.Calendar'],
  muteNewApps: true,
};

export const focusActiveFixture: FocusState = {
  active: true,
  profileId: FIXTURE_IDS.profile,
  source: 'manual',
  startedAt: FIXTURE_NOW,
  endsAt: '2026-11-08T11:00:00.000Z',
};

export const sessionFixture: Session = {
  id: FIXTURE_IDS.session,
  appId: 'code',
  start: '2026-11-08T09:00:00.000Z',
  end: '2026-11-08T09:45:00.000Z',
};

export const dayReportFixture: DayReport = {
  date: FIXTURE_DATE,
  totalSeconds: 16_200,
  byCategory: [
    { category: 'work', seconds: 12_600 },
    { category: 'social', seconds: 2_700 },
    { category: null, seconds: 900 },
  ],
  topApps: [
    { appId: 'code', seconds: 9_000 },
    { appId: 'firefox', seconds: 4_500 },
    { appId: 'slack', seconds: 2_700 },
  ],
  longestFocusStreakSeconds: 5_400,
};

export const batteryNowFixture: BatteryNow = {
  ts: FIXTURE_NOW,
  capacityPct: 64,
  status: 'discharging',
  powerW: 8.2,
  minutesRemaining: 215,
  healthPct: 86.4,
};

export const incidentFixture: Incident = {
  id: FIXTURE_IDS.incident,
  type: 'memory',
  start: '2026-11-08T08:12:00.000Z',
  end: '2026-11-08T08:14:30.000Z',
  peak: 27.5,
  culprits: [
    { pid: 3_141, comm: 'node', container: 'yoman-web-1', cpuPct: 96, rssBytes: 2_147_483_648 },
  ],
};

export const alertFixture: Alert = {
  alertKey: 'battery:low',
  type: 'battery-low',
  level: 'important',
  ts: FIXTURE_NOW,
  params: { percent: 14 },
};

export const settingsFixture: Settings = {
  language: 'he',
  theme: 'system',
  privacy: { storeTitles: false, excludedApps: ['keepassxc'] },
  thresholds: { memory: 10, cpu: 40, io: 30 },
  systemApps: ['org.gnome.Settings'],
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
};

export const windowSampleFixture: WindowSample = {
  kind: 'window',
  ts: FIXTURE_NOW,
  wmClass: 'code',
  pid: 4_242,
  idleMs: 0,
  locked: false,
};
