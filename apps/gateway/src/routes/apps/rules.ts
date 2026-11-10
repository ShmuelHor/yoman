import { Rule, RuleList } from '@yoman/shared/sessions';
import { z } from 'zod';

import { defineHandlers } from '../../core/route-handler.js';

/** A `204 No Content` reply carries no body. */
const NoContent = z.undefined();

/**
 * Category rules, kept by the sessions service, which applies them to new
 * apps. Rule IDs are UUIDs, already validated, so they are safe as a path segment.
 */
export const ruleHandlers = defineHandlers({
  listRules: ({ services }) =>
    services.call('sessions', { method: 'GET', path: '/rules', response: RuleList }),
  createRule: ({ services, body }) =>
    services.call('sessions', { method: 'POST', path: '/rules', body, response: Rule }),
  updateRule: ({ services, params, body }) =>
    services.call('sessions', { method: 'PUT', path: `/rules/${params.id}`, body, response: Rule }),
  deleteRule: ({ services, params }) =>
    services.call('sessions', {
      method: 'DELETE',
      path: `/rules/${params.id}`,
      response: NoContent,
    }),
});
