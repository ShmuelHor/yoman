/**
 * How the sender reads the gateway's answer to `POST /v1/ingest`. Only a 2xx
 * means the gateway has the samples; everything else keeps them buffered.
 */

const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1_000;
/** RFC 9110 §10.2.3: `Retry-After` in delay-seconds. HTTP dates are not used by the gateway. */
const DELAY_SECONDS = /^\d{1,6}$/;

export type IngestStatus =
  | { readonly kind: 'accepted' }
  /** The batch is too big for the gateway: retry with fewer samples. */
  | { readonly kind: 'too-large' }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | undefined }
  /** The token is wrong or missing: retrying cannot help until the config is fixed. */
  | { readonly kind: 'unauthorized' }
  /** Anything else: 4xx contract errors, 5xx, or a gateway without ingest yet (501). */
  | { readonly kind: 'refused' };

/** `Retry-After` as milliseconds, or `undefined` when it is absent or not delay-seconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  const value = header?.trim();
  if (value === undefined || !DELAY_SECONDS.test(value)) {
    return undefined;
  }
  return Number(value) * MS_PER_SECOND;
}

export function classifyIngestStatus(status: number, retryAfter: string | null): IngestStatus {
  if (status >= HTTP_OK_MIN && status <= HTTP_OK_MAX) {
    return { kind: 'accepted' };
  }
  if (status === HTTP_PAYLOAD_TOO_LARGE) {
    return { kind: 'too-large' };
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return { kind: 'rate-limited', retryAfterMs: parseRetryAfter(retryAfter) };
  }
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return { kind: 'unauthorized' };
  }
  return { kind: 'refused' };
}
