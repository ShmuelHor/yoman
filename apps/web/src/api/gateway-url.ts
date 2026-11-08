const GATEWAY_PORT = 4711;

/**
 * The gateway on the same host name the page was loaded from. Keeping
 * `127.0.0.1` with `127.0.0.1` (and `localhost` with `localhost`) makes the
 * `SameSite=Strict` session cookie same-site (SPEC §5, SECURITY A3).
 */
export function gatewayUrl(location: Pick<Location, 'protocol' | 'hostname'>): string {
  return `${location.protocol}//${location.hostname}:${GATEWAY_PORT}`;
}
