import { secretsEqual } from './secret-compare.js';

/** `Bearer <token>`. The scheme is case-insensitive (RFC 9110 §11.1); the token is not. */
const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i;

/** The token from an `Authorization` header, or `undefined` when it is not a Bearer credential. */
export function parseBearer(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  return BEARER.exec(header)?.[1];
}

export type TokenVerifier = (candidate: string) => boolean;

/** Checks the agent's Bearer token against `AGENT_TOKEN` in constant time. */
export function createTokenVerifier(agentToken: string): TokenVerifier {
  return (candidate) => secretsEqual(candidate, agentToken);
}
