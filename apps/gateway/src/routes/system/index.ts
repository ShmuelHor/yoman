import { CulpritList, IncidentList, SystemTimeline } from '@yoman/shared/system';

import { defineHandlers } from '../../core/route-handler.js';

/** The system domain: the system service's own views, passed through. */
export const handlers = defineHandlers({
  systemIncidents: ({ services, query }) =>
    services.call('system', { method: 'GET', path: '/incidents', query, response: IncidentList }),

  systemCulprits: ({ services, query }) =>
    services.call('system', {
      method: 'GET',
      path: '/culprits',
      query: { days: String(query.days) },
      response: CulpritList,
    }),

  systemTimeline: ({ services, query }) =>
    services.call('system', {
      method: 'GET',
      path: '/timeline',
      query: { date: query.date },
      response: SystemTimeline,
    }),
});
