import { responseFixtures } from '@yoman/shared/fixtures/responses';

/** The shared MSW fixtures, keyed by route name, as a mock client answers them. */
export function dashboardTodayFixture(): Record<string, Record<string, unknown>> {
  return {
    dashboardToday: structuredClone(responseFixtures.dashboardToday),
    listApps: structuredClone(responseFixtures.listApps),
  };
}
