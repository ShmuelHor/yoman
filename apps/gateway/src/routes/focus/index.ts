import { FocusState } from '@yoman/shared/focus';
import { z } from 'zod';

import { defineHandlers } from '../../core/route-handler.js';
import {
  AlertPolicyReply,
  AlertQueueReply,
  FocusTransitionReply,
  KnownAppListReply,
  KnownAppsResultReply,
  ProfileListReply,
  ProfileReply,
} from './contracts.js';

/** A `204 No Content` reply carries no body. */
const NoContent = z.undefined();

/**
 * The focus domain, served by the focus service: sessions and their mute and
 * restore commands, profiles, the held-back queue, known apps and the alert
 * policy. IDs are UUIDs, already validated, so they are safe as a path segment.
 *
 * The agent receives the commands in its next ingest reply, built from the
 * session this route started; the commands here go to the caller (web or CLI).
 */
export const handlers = defineHandlers({
  focusStart: ({ services, body }) =>
    services.call('focus', {
      method: 'POST',
      path: '/start',
      body,
      response: FocusTransitionReply,
    }),
  focusStop: ({ services }) =>
    services.call('focus', { method: 'POST', path: '/stop', response: FocusTransitionReply }),
  focusState: ({ services }) =>
    services.call('focus', { method: 'GET', path: '/state', response: FocusState }),
  listProfiles: ({ services }) =>
    services.call('focus', { method: 'GET', path: '/profiles', response: ProfileListReply }),
  createProfile: ({ services, body }) =>
    services.call('focus', { method: 'POST', path: '/profiles', body, response: ProfileReply }),
  updateProfile: ({ services, params, body }) =>
    services.call('focus', {
      method: 'PUT',
      path: `/profiles/${params.id}`,
      body,
      response: ProfileReply,
    }),
  deleteProfile: ({ services, params }) =>
    services.call('focus', {
      method: 'DELETE',
      path: `/profiles/${params.id}`,
      response: NoContent,
    }),
  focusQueue: ({ services }) =>
    services.call('focus', { method: 'GET', path: '/queue', response: AlertQueueReply }),
  listKnownApps: ({ services }) =>
    services.call('focus', { method: 'GET', path: '/known-apps', response: KnownAppListReply }),
  reportKnownApps: ({ services, body }) =>
    services.call('focus', {
      method: 'POST',
      path: '/known-apps',
      body,
      response: KnownAppsResultReply,
    }),
  getAlertPolicy: ({ services }) =>
    services.call('focus', { method: 'GET', path: '/alert-policy', response: AlertPolicyReply }),
  updateAlertPolicy: ({ services, body }) =>
    services.call('focus', {
      method: 'PUT',
      path: '/alert-policy',
      body,
      response: AlertPolicyReply,
    }),
});
