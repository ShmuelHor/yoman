import {
  AlertPolicy,
  AlertQueue,
  FocusChange,
  KnownAppList,
  KnownAppsResult,
  Profile,
  ProfileList,
} from '@yoman/shared/focus';
import { z } from 'zod';

/**
 * The gateway side of the focus service contracts. Replies are parsed loosely:
 * a field the service adds later is dropped, one that is missing or malformed
 * fails the call.
 */

/**
 * `focus POST /start` and `POST /stop` reply: the public `FocusChange`, plus
 * the summary of the session the change closed, which the gateway does not
 * forward (no public contract carries it yet).
 */
export const FocusTransitionReply = z.object(FocusChange.shape);
export type FocusTransitionReply = z.infer<typeof FocusTransitionReply>;

export const ProfileReply = z.object(Profile.shape);
export const ProfileListReply = z.object(ProfileList.shape);
export const AlertQueueReply = z.object(AlertQueue.shape);
export const KnownAppListReply = z.object(KnownAppList.shape);
export const KnownAppsResultReply = z.object(KnownAppsResult.shape);
export const AlertPolicyReply = z.object(AlertPolicy.shape);
