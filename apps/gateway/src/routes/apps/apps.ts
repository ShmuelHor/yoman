import type { AppId } from '@yoman/shared/common';
import { App, AppList } from '@yoman/shared/sessions';

import { NotFoundError } from '../../core/errors.js';
import { defineHandlers } from '../../core/route-handler.js';

/**
 * `AppId` allows `.` and `..`, and as a path segment they would walk up the
 * sessions service's URL (`/apps/..` is `/`). No app is named that, so it is
 * an unknown app. Every other `AppId` character is safe in a path unencoded.
 */
const DOT_SEGMENTS: ReadonlySet<string> = new Set(['.', '..']);

function appPath(id: AppId): `/apps/${string}` {
  if (DOT_SEGMENTS.has(id)) {
    throw new NotFoundError();
  }
  return `/apps/${id}`;
}

/** The apps the sessions service has seen, and the user's name and category for each. */
export const appHandlers = defineHandlers({
  listApps: ({ services }) =>
    services.call('sessions', { method: 'GET', path: '/apps', response: AppList }),
  // `async`, so a bad path is a rejected promise like any other failure.
  updateApp: async ({ services, params, body }) =>
    services.call('sessions', { method: 'PUT', path: appPath(params.id), body, response: App }),
});
