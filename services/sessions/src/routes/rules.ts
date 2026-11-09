import { defineRoute, HTTP_NO_CONTENT, type Route } from '@yoman/service-kit/route';
import { IdParams } from '@yoman/shared/common';
import { Rule, RuleInput, RuleList } from '@yoman/shared/sessions';
import { z } from 'zod';

import { createRule, deleteRule, listRules, updateRule } from '../use-cases/manage-rules.js';
import type { RouteDeps } from './route-deps.js';

const HTTP_CREATED = 201;

export function ruleRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/rules',
      schema: { response: RuleList },
      handler: async () => ({ items: await listRules(store) }),
    }),
    defineRoute({
      method: 'POST',
      url: '/rules',
      status: HTTP_CREATED,
      schema: { body: RuleInput, response: Rule },
      handler: ({ body }) => createRule(store, body, now()),
    }),
    defineRoute({
      method: 'PUT',
      url: '/rules/:id',
      schema: { params: IdParams, body: RuleInput, response: Rule },
      handler: ({ params, body }) => updateRule(store, params.id, body, now()),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/rules/:id',
      status: HTTP_NO_CONTENT,
      schema: { params: IdParams, response: z.undefined() },
      handler: ({ params }) => deleteRule(store, params.id, now()),
    }),
  ];
}
