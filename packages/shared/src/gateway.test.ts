import { describe, expect, it } from 'vitest';
import { DashboardToday, ExportQuery, WebSession } from './gateway.js';
import { LIMITS } from './limits.js';

describe('gateway composites', () => {
  it('accepts a session, a degraded dashboard and an export query', () => {
    expect(
      WebSession.safeParse({
        csrfToken: 'a'.repeat(LIMITS.csrfTokenMinLength),
        expiresAt: '2026-11-09T10:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      DashboardToday.safeParse({
        data: { reports: null, battery: null, openIncidents: null, focus: { active: false } },
        degraded: ['reports', 'battery', 'system'],
      }).success,
    ).toBe(true);
    expect(ExportQuery.safeParse({ from: '2026-11-01', to: '2026-11-08' }).success).toBe(true);
  });

  it('rejects short tokens and a dashboard without the envelope', () => {
    expect(
      WebSession.safeParse({ csrfToken: 'x', expiresAt: '2026-11-09T10:00:00Z' }).success,
    ).toBe(false);
    expect(DashboardToday.safeParse({ reports: null }).success).toBe(false);
  });
});
