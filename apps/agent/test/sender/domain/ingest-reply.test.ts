import { describe, expect, it } from 'vitest';
import { classifyIngestStatus, parseRetryAfter } from '../../../src/sender/domain/ingest-reply.js';

const STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  lastSuccess: 299,
  redirect: 300,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  tooLarge: 413,
  tooMany: 429,
  internal: 500,
  notImplemented: 501,
  badGateway: 502,
  unavailable: 503,
} as const;
const MS_PER_SECOND = 1_000;
const RETRY_SECONDS = 7;
const LONG_HEADER_LENGTH = 20;

describe('classifyIngestStatus', () => {
  it.each([STATUS.ok, STATUS.created, STATUS.noContent, STATUS.lastSuccess])(
    'treats %i as accepted',
    (status) => {
      expect(classifyIngestStatus(status, null)).toEqual({ kind: 'accepted' });
    },
  );

  it('asks for a smaller batch on 413', () => {
    expect(classifyIngestStatus(STATUS.tooLarge, null)).toEqual({ kind: 'too-large' });
  });

  it('reads Retry-After on 429', () => {
    expect(classifyIngestStatus(STATUS.tooMany, String(RETRY_SECONDS))).toEqual({
      kind: 'rate-limited',
      retryAfterMs: RETRY_SECONDS * MS_PER_SECOND,
    });
  });

  it.each([STATUS.unauthorized, STATUS.forbidden])(
    'reports %i as an authentication problem',
    (status) => {
      expect(classifyIngestStatus(status, null)).toEqual({ kind: 'unauthorized' });
    },
  );

  it.each([
    STATUS.redirect,
    STATUS.badRequest,
    STATUS.notFound,
    STATUS.internal,
    STATUS.notImplemented,
    STATUS.badGateway,
    STATUS.unavailable,
  ])('keeps the samples on %i', (status) => {
    expect(classifyIngestStatus(status, null)).toEqual({ kind: 'refused' });
  });
});

describe('parseRetryAfter', () => {
  it('converts delay-seconds to milliseconds', () => {
    expect(parseRetryAfter(` ${RETRY_SECONDS} `)).toBe(RETRY_SECONDS * MS_PER_SECOND);
  });

  it.each([
    ['a missing header', null],
    ['an HTTP date', 'Wed, 21 Oct 2026 07:28:00 GMT'],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
    ['an absurdly long value', '9'.repeat(LONG_HEADER_LENGTH)],
  ])('ignores %s', (_label, header) => {
    expect(parseRetryAfter(header)).toBeUndefined();
  });
});
