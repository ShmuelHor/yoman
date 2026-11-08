import { z } from 'zod';
import { BatteryNow } from './battery.js';
import { LocalDate, Timestamp, withDegraded } from './common.js';
import { FocusState } from './focus.js';
import { GoalList } from './goals.js';
import { LIMITS } from './limits.js';
import { DayReport } from './reports.js';
import { AppList, RuleList, Session } from './sessions.js';
import { Settings } from './settings.js';
import { IncidentList } from './system.js';

/** `GET /v1/session`: sets the session cookie and hands the web its CSRF token. */
export const WebSession = z.strictObject({
  csrfToken: z.string().min(LIMITS.csrfTokenMinLength).max(LIMITS.csrfTokenMaxLength),
  expiresAt: Timestamp,
});
export type WebSession = z.infer<typeof WebSession>;

/**
 * `GET /v1/dashboard/today`: reports, battery, system and focus called in parallel.
 * A section is `null` when its service is listed in `degraded` (or, for battery, when
 * the device has no battery).
 */
export const DashboardToday = withDegraded(
  z.strictObject({
    reports: DayReport.nullable(),
    battery: BatteryNow.nullable(),
    openIncidents: IncidentList.nullable(),
    focus: FocusState.nullable(),
  }),
);
export type DashboardToday = z.infer<typeof DashboardToday>;

export const ExportQuery = z.strictObject({ from: LocalDate, to: LocalDate });
export type ExportQuery = z.infer<typeof ExportQuery>;

/** `GET /v1/export`: the user's own data as JSON. Session only (SECURITY A16). */
export const ExportBundle = z.strictObject({
  exportedAt: Timestamp,
  from: LocalDate,
  to: LocalDate,
  settings: Settings,
  apps: AppList,
  rules: RuleList,
  goals: GoalList,
  sessions: z.array(Session).max(LIMITS.exportSessions),
});
export type ExportBundle = z.infer<typeof ExportBundle>;
