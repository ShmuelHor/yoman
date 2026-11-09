import { defineRoute, type Route } from '@yoman/service-kit/route';
import { BatteryNow, HealthTrend, HealthTrendQuery, PowerByApp } from '@yoman/shared/battery';

import { PowerByAppRequest } from '../contracts.js';
import { localDateOf } from '../domain/local-time.js';
import { batteryNow } from '../use-cases/battery-now.js';
import { healthTrend } from '../use-cases/health-trend.js';
import { powerByApp } from '../use-cases/power-by-app.js';
import type { RouteDeps } from './route-deps.js';

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
      schema: { body: PowerByAppRequest, response: PowerByApp },
      handler: async ({ body }) => ({ items: await powerByApp(store, body) }),
    }),
  ];
}
