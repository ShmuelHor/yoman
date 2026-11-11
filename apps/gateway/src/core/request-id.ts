import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
/** The log field every line of a request carries. */
export const REQUEST_ID_LOG_LABEL = 'reqId';

const MAX_REQUEST_ID_LENGTH = 64;
const GENERATED_ID_LENGTH = 12;
/**
 * A caller-supplied id ends up in logs and a response header, so only a
 * conservative alphabet is accepted: no spaces, quotes or line breaks.
 */
const VALID_REQUEST_ID = new RegExp(`^[A-Za-z0-9._-]{1,${MAX_REQUEST_ID_LENGTH}}$`);

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value);
}

/** Keeps the caller's id when it is well formed, otherwise starts a new trace. */
export function resolveRequestId(request: Pick<IncomingMessage, 'headers'>): string {
  const supplied = request.headers[REQUEST_ID_HEADER];
  if (isValidRequestId(supplied)) {
    return supplied;
  }
  return `req-${randomUUID().replaceAll('-', '').slice(0, GENERATED_ID_LENGTH)}`;
}
