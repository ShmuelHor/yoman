import { defineHandlers } from '../../core/route-handler.js';
import { createDashboardToday } from './today.js';

/** The dashboard domain: one aggregate for the "Today" page. */
export const handlers = defineHandlers({
  dashboardToday: createDashboardToday({ now: () => Date.now() }),
});
