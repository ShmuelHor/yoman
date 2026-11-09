/**
 * Who may talk to the gateway (SECURITY A3, A4). Both lists are fixed: the
 * gateway is published only on 127.0.0.1:4711 and the web only on :4710.
 */
export const GATEWAY_PUBLIC_PORT = 4711;
const WEB_PUBLIC_PORT = 4710;
const LOOPBACK_NAMES = ['127.0.0.1', 'localhost'] as const;

/** DNS rebinding defense: a request must name the gateway itself in `Host`. */
export const ALLOWED_HOSTS: readonly string[] = LOOPBACK_NAMES.map(
  (name) => `${name}:${GATEWAY_PUBLIC_PORT}`,
);

/** The only browser origins that may call the gateway: the web app. */
export const ALLOWED_ORIGINS: readonly string[] = LOOPBACK_NAMES.map(
  (name) => `http://${name}:${WEB_PUBLIC_PORT}`,
);

/** Host names are case-insensitive; anything else must match exactly. */
export function isAllowedHost(host: string | undefined): boolean {
  return host !== undefined && ALLOWED_HOSTS.includes(host.toLowerCase());
}

/**
 * Exact match only, so `http://localhost:4710.evil.example` or the opaque
 * origin `null` (sandboxed frames, `file:` pages) never pass.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin);
}
