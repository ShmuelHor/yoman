import { describe, expect, it } from 'vitest';

import {
  createSessionStore,
  MAX_SESSIONS,
  SESSION_TTL_MS,
  type SessionStore,
} from '../../src/core/web-sessions.js';

const START = Date.parse('2026-11-08T10:00:00Z');

function counterSecrets(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `secret-${next}`;
  };
}

function storeAt(clock: { now: number }, overrides: { maxSessions?: number } = {}): SessionStore {
  return createSessionStore({ now: () => clock.now, randomSecret: counterSecrets(), ...overrides });
}

describe('createSessionStore', () => {
  it('creates a session with its own id, CSRF token and expiry', () => {
    const store = storeAt({ now: START });

    const session = store.create();

    expect(session).toEqual({
      id: 'secret-1',
      csrfToken: 'secret-2',
      expiresAt: START + SESSION_TTL_MS,
    });
    expect(store.ttlMs).toBe(SESSION_TTL_MS);
  });

  it('uses 32 random bytes for the id and the token by default', () => {
    const session = createSessionStore().create();

    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.csrfToken).not.toBe(session.id);
  });

  it('finds a live session by its cookie value', () => {
    const store = storeAt({ now: START });
    const session = store.create();

    expect(store.find(session.id)).toEqual(session);
  });

  it('finds nothing for an unknown or missing cookie', () => {
    const store = storeAt({ now: START });
    store.create();

    expect(store.find('unknown')).toBeUndefined();
    expect(store.find(undefined)).toBeUndefined();
  });

  it('expires a session after its TTL', () => {
    const clock = { now: START };
    const store = storeAt(clock);
    const session = store.create();

    clock.now = START + SESSION_TTL_MS - 1;
    expect(store.find(session.id)).toBeDefined();
    clock.now = START + SESSION_TTL_MS;
    expect(store.find(session.id)).toBeUndefined();
  });

  it('drops expired sessions when a new one is created', () => {
    const clock = { now: START };
    const store = storeAt(clock, { maxSessions: 2 });
    const expired = store.create();
    clock.now = START + SESSION_TTL_MS;
    const first = store.create();

    const second = store.create();

    expect(store.find(expired.id)).toBeUndefined();
    expect(store.find(first.id)).toBeDefined();
    expect(store.find(second.id)).toBeDefined();
  });

  it('drops the oldest session beyond the cap', () => {
    const store = storeAt({ now: START });
    const sessions = Array.from({ length: MAX_SESSIONS + 1 }, () => store.create());

    expect(store.find(sessions[0]?.id)).toBeUndefined();
    expect(store.find(sessions[1]?.id)).toBeDefined();
    expect(store.find(sessions.at(-1)?.id)).toBeDefined();
  });

  it('matches only the exact CSRF token of the session', () => {
    const store = storeAt({ now: START });
    const session = store.create();
    const other = store.create();

    expect(store.csrfMatches(session, session.csrfToken)).toBe(true);
    expect(store.csrfMatches(session, other.csrfToken)).toBe(false);
    expect(store.csrfMatches(session, undefined)).toBe(false);
    expect(store.csrfMatches(session, '')).toBe(false);
  });
});
