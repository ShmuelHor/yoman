import { defineRoute, type Route } from '@yoman/service-kit/route';
import { DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';

import { ReportWeekQuery, TopAppList, TopAppsQuery } from '../contracts.js';
import {
  lastWeekSummary,
  todayReport,
  topAppsBetween,
  weekReport,
} from '../use-cases/read-reports.js';
import type { RouteDeps } from './route-deps.js';

export function reportRoutes({ store, now, timeZone }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/today',
      schema: { response: DayReport },
      handler: () => todayReport(store, now(), timeZone),
    }),
    defineRoute({
      method: 'GET',
      url: '/week',
      schema: { query: ReportWeekQuery, response: WeekReport },
      handler: ({ query }) => weekReport(store, query.start, timeZone),
    }),
    defineRoute({
      method: 'GET',
      url: '/top-apps',
      schema: { query: TopAppsQuery, response: TopAppList },
      handler: async ({ query }) => ({ items: await topAppsBetween(store, query.from, query.to) }),
    }),
    defineRoute({
      method: 'GET',
      url: '/weekly-summary',
      schema: { response: WeeklySummary },
      handler: () => lastWeekSummary(store, now(), timeZone),
    }),
  ];
}
