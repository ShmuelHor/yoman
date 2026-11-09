import { randomBytes } from 'node:crypto';

import { secretsEqual } from './secret-compare.js';

/** 32 random bytes, like `AGENT_TOKEN`, so neither value can be guessed. */
const SECRET_BYTES = 32;
const MS_PER_HOUR = 3_600_000;
const SESSION_TTL_HOURS = 12;
/** A working day. The web asks for a new session on 401, so expiry is invisible to the user. */
export const SESSION_TTL_MS = SESSION_TTL_HOURS * MS_PER_HOUR;
/** Sessions live in memory; the cap stops a client from growing the map without bound. */
export const MAX_SESSIONS = 64;

export interface SessionRecord {
  readonly id: string;
  readonly csrfToken: string;
  readonly expiresAt: number;
}

export interface SessionStoreOptions {
  readonly now?: () => number;
  readonly randomSecret?: () => string;
  readonly ttlMs?: number;
  readonly maxSessions?: number;
}

export interface SessionStore {
  /** How long a session lives; also the cookie's `Max-Age`. */
  readonly ttlMs: number;
  /** A new session with its own CSRF token. The oldest session is dropped past the cap. */
  readonly create: () => SessionRecord;
  /** The live session for a cookie value, or `undefined` when it is unknown or expired. */
  readonly find: (id: string | undefined) => SessionRecord | undefined;
  /** Constant-time CSRF check (SECURITY A3). */
  readonly csrfMatches: (session: SessionRecord, token: string | undefined) => boolean;
}

const randomSecretDefault = (): string => randomBytes(SECRET_BYTES).toString('base64url');

/**
 * The web's sessions, in memory. A gateway restart signs the web out, which
 * costs one extra `GET /v1/session` and keeps credentials out of the database.
 */
export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const now = options.now ?? Date.now;
  const randomSecret = options.randomSecret ?? randomSecretDefault;
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const maxSessions = options.maxSessions ?? MAX_SESSIONS;
  // Map keeps insertion order, so the first key is always the oldest session.
  const sessions = new Map<string, SessionRecord>();

  const dropExpired = (at: number): void => {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= at) {
        sessions.delete(id);
      }
    }
  };

  const dropOldestOverCap = (): void => {
    while (sessions.size >= maxSessions) {
      const oldest = sessions.keys().next();
      if (oldest.done === true) {
        return;
      }
      sessions.delete(oldest.value);
    }
  };

  return {
    ttlMs,
    create: (): SessionRecord => {
      const at = now();
      dropExpired(at);
      dropOldestOverCap();
      const session = { id: randomSecret(), csrfToken: randomSecret(), expiresAt: at + ttlMs };
      sessions.set(session.id, session);
      return session;
    },
    find: (id): SessionRecord | undefined => {
      if (id === undefined) {
        return undefined;
      }
      const session = sessions.get(id);
      if (session === undefined) {
        return undefined;
      }
      if (session.expiresAt <= now()) {
        sessions.delete(id);
        return undefined;
      }
      return session;
    },
    csrfMatches: (session, token): boolean =>
      token !== undefined && secretsEqual(token, session.csrfToken),
  };
}
