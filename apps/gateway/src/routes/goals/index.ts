import { Goal, GoalList, GoalProgress } from '@yoman/shared/goals';
import { z } from 'zod';

import { defineHandlers } from '../../core/route-handler.js';

/** A `204 No Content` reply carries no body. */
const NoContent = z.undefined();

/**
 * The goals domain, served by the goals service. Goal IDs are UUIDs, already
 * validated, so they are safe as a path segment.
 */
export const handlers = defineHandlers({
  listGoals: ({ services }) =>
    services.call('goals', { method: 'GET', path: '/goals', response: GoalList }),
  createGoal: ({ services, body }) =>
    services.call('goals', { method: 'POST', path: '/goals', body, response: Goal }),
  updateGoal: ({ services, params, body }) =>
    services.call('goals', { method: 'PUT', path: `/goals/${params.id}`, body, response: Goal }),
  deleteGoal: ({ services, params }) =>
    services.call('goals', { method: 'DELETE', path: `/goals/${params.id}`, response: NoContent }),
  goalProgress: ({ services, query }) =>
    services.call('goals', {
      method: 'GET',
      path: '/progress',
      query: { date: query.date },
      response: GoalProgress,
    }),
});
