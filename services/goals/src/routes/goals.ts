import { defineRoute, HTTP_NO_CONTENT, type Route } from '@yoman/service-kit/route';
import { IdParams } from '@yoman/shared/common';
import { Goal, GoalInput, GoalList } from '@yoman/shared/goals';
import { z } from 'zod';

import { createGoal, deleteGoal, listGoals, updateGoal } from '../use-cases/manage-goals.js';
import type { RouteDeps } from './route-deps.js';

const HTTP_CREATED = 201;

export function goalRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/goals',
      schema: { response: GoalList },
      handler: async () => ({ items: await listGoals(store) }),
    }),
    defineRoute({
      method: 'POST',
      url: '/goals',
      status: HTTP_CREATED,
      schema: { body: GoalInput, response: Goal },
      handler: ({ body }) => createGoal(store, body),
    }),
    defineRoute({
      method: 'PUT',
      url: '/goals/:id',
      schema: { params: IdParams, body: GoalInput, response: Goal },
      handler: ({ params, body }) => updateGoal(store, params.id, body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/goals/:id',
      status: HTTP_NO_CONTENT,
      schema: { params: IdParams, response: z.undefined() },
      handler: ({ params }) => deleteGoal(store, params.id),
    }),
  ];
}
