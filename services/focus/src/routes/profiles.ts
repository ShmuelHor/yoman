import { defineRoute, HTTP_NO_CONTENT, type Route } from '@yoman/service-kit/route';
import { IdParams } from '@yoman/shared/common';
import { Profile, ProfileInput, ProfileList } from '@yoman/shared/focus';
import { z } from 'zod';

import {
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile,
} from '../use-cases/manage-profiles.js';
import type { RouteDeps } from './route-deps.js';

const HTTP_CREATED = 201;

export function profileRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/profiles',
      schema: { response: ProfileList },
      handler: async () => ({ items: await listProfiles(store) }),
    }),
    defineRoute({
      method: 'POST',
      url: '/profiles',
      status: HTTP_CREATED,
      schema: { body: ProfileInput, response: Profile },
      handler: ({ body }) => createProfile(store, body),
    }),
    defineRoute({
      method: 'PUT',
      url: '/profiles/:id',
      schema: { params: IdParams, body: ProfileInput, response: Profile },
      handler: ({ params, body }) => updateProfile(store, params.id, body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/profiles/:id',
      status: HTTP_NO_CONTENT,
      schema: { params: IdParams, response: z.undefined() },
      handler: ({ params }) => deleteProfile(store, params.id),
    }),
  ];
}
