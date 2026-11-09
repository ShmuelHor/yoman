import { describe, expect, it } from 'vitest';

import { createTokenVerifier } from '../../src/core/agent-token.js';
import {
  type Authenticator,
  authenticate,
  type Credentials,
  singleHeader,
} from '../../src/core/authenticate.js';
import { ForbiddenError, UnauthorizedError } from '../../src/core/errors.js';
import { createSessionStore, type SessionRecord } from '../../src/core/web-sessions.js';
import { AGENT_TOKEN, WEB_ORIGIN } from '../harness.js';

interface Setup {
  readonly auth: Authenticator;
  readonly session: SessionRecord;
  readonly none: Credentials;
  readonly agent: Credentials;
  readonly web: Credentials;
}

function setup(): Setup {
  const sessions = createSessionStore();
  const auth = { verifyAgentToken: createTokenVerifier(AGENT_TOKEN), sessions };
  const session = sessions.create();
  const none: Credentials = {
    method: 'GET',
    authorization: undefined,
    sessionCookie: undefined,
    csrfToken: undefined,
    origin: undefined,
  };
  const agent: Credentials = { ...none, authorization: `Bearer ${AGENT_TOKEN}` };
  const web: Credentials = {
    ...none,
    sessionCookie: session.id,
    csrfToken: session.csrfToken,
    origin: WEB_ORIGIN,
  };
  return { auth, session, none, agent, web };
}

describe('authenticate', () => {
  it('accepts the agent token on agent routes', () => {
    const { auth, agent } = setup();

    expect(authenticate(auth, 'agent', { ...agent, method: 'POST' })).toEqual({ kind: 'agent' });
  });

  it('accepts a session on session routes', () => {
    const { auth, session, web } = setup();

    expect(authenticate(auth, 'session', web)).toEqual({ kind: 'session', id: session.id });
  });

  it('accepts either credential on either routes', () => {
    const { auth, agent, web } = setup();

    expect(authenticate(auth, 'either', agent).kind).toBe('agent');
    expect(authenticate(auth, 'either', web).kind).toBe('session');
  });

  it.each(['agent', 'session', 'either'] as const)(
    'rejects a request with no credential on %s routes with 401',
    (routeAuth) => {
      const { auth, none } = setup();

      expect(() => authenticate(auth, routeAuth, none)).toThrow(UnauthorizedError);
    },
  );

  it('rejects a wrong token with 401, even with a valid session', () => {
    const { auth, web } = setup();
    const credentials = { ...web, authorization: 'Bearer wrong-token' };

    expect(() => authenticate(auth, 'either', credentials)).toThrow(UnauthorizedError);
  });

  it('rejects a non-Bearer authorization with 401', () => {
    const { auth, none } = setup();

    expect(() =>
      authenticate(auth, 'agent', { ...none, authorization: `Basic ${AGENT_TOKEN}` }),
    ).toThrow(UnauthorizedError);
  });

  it('rejects an unknown session cookie with 401', () => {
    const { auth, web } = setup();

    expect(() => authenticate(auth, 'session', { ...web, sessionCookie: 'forged' })).toThrow(
      UnauthorizedError,
    );
  });

  it('rejects the agent on session routes and the web on agent routes with 403', () => {
    const { auth, agent, web } = setup();

    expect(() => authenticate(auth, 'session', agent)).toThrow(ForbiddenError);
    expect(() => authenticate(auth, 'agent', web)).toThrow(ForbiddenError);
  });

  it('reads with a session need no CSRF token', () => {
    const { auth, web } = setup();

    expect(authenticate(auth, 'session', { ...web, csrfToken: undefined }).kind).toBe('session');
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'rejects a %s with a session but no CSRF token with 403',
    (method) => {
      const { auth, web } = setup();

      expect(() => authenticate(auth, 'session', { ...web, method, csrfToken: undefined })).toThrow(
        ForbiddenError,
      );
    },
  );

  it('rejects a session write with another session CSRF token with 403', () => {
    const { auth, web } = setup();
    const other = auth.sessions.create();

    expect(() =>
      authenticate(auth, 'session', { ...web, method: 'PUT', csrfToken: other.csrfToken }),
    ).toThrow(ForbiddenError);
  });

  it.each([undefined, 'http://evil.example'])(
    'rejects a session write from origin %s with 403',
    (origin) => {
      const { auth, web } = setup();

      expect(() => authenticate(auth, 'session', { ...web, method: 'POST', origin })).toThrow(
        ForbiddenError,
      );
    },
  );

  it('accepts a session write with the CSRF token from the web origin', () => {
    const { auth, web } = setup();

    expect(authenticate(auth, 'session', { ...web, method: 'DELETE' }).kind).toBe('session');
  });

  it('lets the web origin, and only it, call origin routes', () => {
    const { auth, none } = setup();

    expect(authenticate(auth, 'origin', { ...none, origin: WEB_ORIGIN })).toEqual({
      kind: 'web-origin',
    });
    expect(() => authenticate(auth, 'origin', none)).toThrow(UnauthorizedError);
    expect(() => authenticate(auth, 'origin', { ...none, origin: 'http://evil.example' })).toThrow(
      ForbiddenError,
    );
  });
});

describe('singleHeader', () => {
  it('keeps a single value and drops a repeated header', () => {
    expect(singleHeader('a')).toBe('a');
    expect(singleHeader(['a', 'b'])).toBeUndefined();
    expect(singleHeader(undefined)).toBeUndefined();
  });
});
