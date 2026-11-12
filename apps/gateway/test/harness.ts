import { randomBytes } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';

const TOKEN_BYTES = 32;

/** Built at runtime so no token-shaped literal is ever committed. */
export const AGENT_TOKEN = randomBytes(TOKEN_BYTES).toString('base64url');
/** Random per run, like the token, so nothing secret-looking is committed. */
export const GATEWAY_DB_PASSWORD = randomBytes(TOKEN_BYTES).toString('base64url');
export const GATEWAY_HOST = '127.0.0.1:4711';
export const WEB_ORIGIN = 'http://127.0.0.1:4710';

export const silentLogger: FastifyBaseLogger = pino({ level: 'silent' });

/** HTTP statuses the tests assert, by name. */
export const STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  MISDIRECTED: 421,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  UNAVAILABLE: 503,
} as const;
