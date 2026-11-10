import { defineRoute, type Route } from '@yoman/service-kit/route';
import { FocusStart, FocusState } from '@yoman/shared/focus';

import { FocusTransition } from '../contracts.js';
import { readFocusState, startFocus, stopFocus } from '../use-cases/focus-sessions.js';
import type { RouteDeps } from './route-deps.js';

export function focusRoutes({ store, now, timeZone }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/state',
      schema: { response: FocusState },
      handler: () => readFocusState(store, now()),
    }),
    defineRoute({
      method: 'POST',
      url: '/start',
      schema: { body: FocusStart, response: FocusTransition },
      handler: ({ body }) => startFocus(store, body, now(), timeZone),
    }),
    defineRoute({
      method: 'POST',
      url: '/stop',
      schema: { response: FocusTransition },
      handler: () => stopFocus(store, now()),
    }),
  ];
}
