import { defineRoute, HTTP_NO_CONTENT, type Route } from '@yoman/service-kit/route';
import { IdParams } from '@yoman/shared/common';
import { z } from 'zod';

import { Schedule, ScheduleInput, ScheduleList } from '../contracts.js';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../use-cases/manage-schedules.js';
import type { RouteDeps } from './route-deps.js';

const HTTP_CREATED = 201;

export function scheduleRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/schedules',
      schema: { response: ScheduleList },
      handler: async () => ({ items: await listSchedules(store) }),
    }),
    defineRoute({
      method: 'POST',
      url: '/schedules',
      status: HTTP_CREATED,
      schema: { body: ScheduleInput, response: Schedule },
      handler: ({ body }) => createSchedule(store, body),
    }),
    defineRoute({
      method: 'PUT',
      url: '/schedules/:id',
      schema: { params: IdParams, body: ScheduleInput, response: Schedule },
      handler: ({ params, body }) => updateSchedule(store, params.id, body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/schedules/:id',
      status: HTTP_NO_CONTENT,
      schema: { params: IdParams, response: z.undefined() },
      handler: ({ params }) => deleteSchedule(store, params.id),
    }),
  ];
}
