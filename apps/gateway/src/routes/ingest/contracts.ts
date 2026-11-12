import { Alert } from '@yoman/shared/alerts';
import { Category } from '@yoman/shared/common';
import { KnownApp, Profile } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';
import { Session } from '@yoman/shared/sessions';
import { z } from 'zod';

/**
 * The gateway side of the service contracts ingest uses. Services own their
 * own request types (the gateway never imports a service), so the pieces the
 * gateway reads or forwards are described here, from shared schemas only.
 * Replies are parsed loosely: an extra field a service adds later is ignored,
 * a missing or malformed one fails the call.
 */

const SampleCount = z.int().min(0).max(LIMITS.ingestSamples);
const AlertList = z.array(Alert).max(LIMITS.listSize);

/** A session the sessions service closed, forwarded to reports as it is. */
export const ClosedSession = z.strictObject({ session: Session, category: Category.nullable() });
export type ClosedSession = z.infer<typeof ClosedSession>;

/** `sessions POST /samples` reply. */
export const SessionsReply = z.object({
  accepted: SampleCount,
  closed: z.array(ClosedSession).max(LIMITS.ingestSamples),
});
export type SessionsReply = z.infer<typeof SessionsReply>;

/** `battery POST /samples` and `system POST /samples` reply. */
export const AlertingReply = z.object({ accepted: SampleCount, alerts: AlertList });
export type AlertingReply = z.infer<typeof AlertingReply>;

/** `reports POST /sessions` reply, which the gateway does not need beyond success. */
export const CountedReply = z.object({ counted: SampleCount });

/** `focus POST /route` reply: what to notify now; the rest was queued or rate limited. */
export const RouteReply = z.object({
  deliver: AlertList,
  queued: z.int().min(0).max(LIMITS.listSize),
});
export type RouteReply = z.infer<typeof RouteReply>;

/** `focus GET /profiles` reply. */
export const ProfilesReply = z.object({ items: z.array(Profile).max(LIMITS.listSize) });
export type ProfilesReply = z.infer<typeof ProfilesReply>;

/** `focus GET /known-apps` reply. */
export const KnownAppsReply = z.object({ items: z.array(KnownApp).max(LIMITS.listSize) });
export type KnownAppsReply = z.infer<typeof KnownAppsReply>;
