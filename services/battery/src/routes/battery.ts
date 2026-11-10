import { defineRoute, type Route } from '@yoman/service-kit/route';
import { BatteryNow, HealthTrend, HealthTrendQuery, PowerByApp } from '@yoman/shared/battery';
import { LIMITS } from '@yoman/shared/limits';

import { PowerByAppRequest } from '../contracts.js';
import { localDateOf } from '../domain/local-time.js';
import { batteryNow } from '../use-cases/battery-now.js';
import { healthTrend } from '../use-cases/health-trend.js';
import { powerByApp } from '../use-cases/power-by-app.js';
import type { RouteDeps } from './route-deps.js';

/**
 * A generous bound on one `FocusSession` as JSON (an app id, two timestamps
 * and the punctuation, about 110 bytes). The default 1 MiB would reject a
 * real 92-day timeline of up to `LIMITS.exportSessions` sessions with a 413.
 */
const SESSION_JSON_BYTES = 256;
const POWER_BY_APP_BODY_LIMIT = LIMITS.exportSessions * SESSION_JSON_BYTES;

export function batteryRoutes({ store, now, timeZone }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/now',
      schema: { response: BatteryNow.nullable() },
      handler: () => batteryNow(store),
    }),
    defineRoute({
      method: 'GET',
      url: '/health-trend',
      schema: { query: HealthTrendQuery, response: HealthTrend },
      handler: async ({ query }) => {
        const today = localDateOf(now().getTime(), timeZone);
        return { items: await healthTrend(store, query.days, today) };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/power-by-app',
      bodyLimit: POWER_BY_APP_BODY_LIMIT,
      schema: { body: PowerByAppRequest, response: PowerByApp },
      handler: async ({ body }) => ({ items: await powerByApp(store, body) }),
    }),
  ];
}
