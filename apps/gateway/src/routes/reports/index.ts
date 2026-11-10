import { WeekReport } from '@yoman/shared/reports';

import { defineHandlers } from '../../core/route-handler.js';

/** The reports domain: the reports service's own views, passed through. */
export const handlers = defineHandlers({
  week: ({ services, query }) =>
    services.call('reports', {
      method: 'GET',
      path: '/week',
      query: { start: query.start },
      response: WeekReport,
    }),
});
