import { defineRoute, type Route } from '@yoman/service-kit/route';
import { DateQuery } from '@yoman/shared/common';
import { GoalProgress } from '@yoman/shared/goals';

import { DayTotals, EvaluateResult } from '../contracts.js';
import { evaluateTotals } from '../use-cases/evaluate-totals.js';
import { goalProgress } from '../use-cases/goal-progress.js';
import type { RouteDeps } from './route-deps.js';

export function evaluateRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'POST',
      url: '/evaluate',
      schema: { body: DayTotals, response: EvaluateResult },
      handler: ({ body }) => evaluateTotals(store, body, now()),
    }),
    defineRoute({
      method: 'GET',
      url: '/progress',
      schema: { query: DateQuery, response: GoalProgress },
      handler: ({ query }) => goalProgress(store, query.date),
    }),
  ];
}
