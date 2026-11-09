/**
 * Headers on every gateway response, errors included (SECURITY A6, ST07). The
 * gateway serves only JSON, so its CSP allows nothing at all: a response that
 * a browser is tricked into rendering as a page can load and run nothing.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy':
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  // Blocks no-cors embedding (<img>, <script>) from other origins; CORS fetches are unaffected.
  'cross-origin-resource-policy': 'same-origin',
  // Responses carry personal activity data, so no browser or proxy may keep a copy.
  'cache-control': 'no-store',
};
