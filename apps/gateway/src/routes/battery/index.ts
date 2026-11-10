import { BatteryNow, HealthTrend, PowerByApp } from '@yoman/shared/battery';

import { defineHandlers } from '../../core/route-handler.js';
import { SessionRange, toPowerByAppRequest } from './timeline.js';

/** The battery domain: the battery service's views, and the power-by-app attribution. */
export const handlers = defineHandlers({
  batteryNow: ({ services }) =>
    // `null` is a device without a battery, not an outage.
    services.call('battery', { method: 'GET', path: '/now', response: BatteryNow.nullable() }),

  batteryHealthTrend: ({ services, query }) =>
    services.call('battery', {
      method: 'GET',
      path: '/health-trend',
      query: { days: String(query.days) },
      response: HealthTrend,
    }),

  /**
   * Services never call each other (SPEC §2), so the gateway fetches the
   * sessions of the range and hands the timeline to battery, which cannot
   * attribute power to an app without it.
   */
  batteryPowerByApp: async ({ services, query }) => {
    const { items } = await services.call('sessions', {
      method: 'GET',
      path: '/sessions',
      query,
      response: SessionRange,
    });
    return services.call('battery', {
      method: 'POST',
      path: '/power-by-app',
      body: toPowerByAppRequest(query, items),
      response: PowerByApp,
    });
  },
});
