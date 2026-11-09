import { defineRoute, type Route } from '@yoman/service-kit/route';

import { SessionBatch, SessionBatchResult } from '../contracts.js';
import { countSessions } from '../use-cases/count-sessions.js';
import type { RouteDeps } from './route-deps.js';

export function sessionRoutes({ store, timeZone }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'POST',
      url: '/sessions',
      schema: { body: SessionBatch, response: SessionBatchResult },
      handler: ({ body }) => countSessions(store, body.sessions, timeZone),
    }),
  ];
}
