import { describe, expect, it } from 'vitest';

import {
  BadRequestError,
  InternalError,
  PayloadTooLargeError,
  toErrorBody,
  toGatewayError,
  ValidationError,
} from '../../src/core/errors.js';
import { STATUS } from '../harness.js';

describe('toGatewayError', () => {
  it('keeps a gateway error as it is', () => {
    const error = new ValidationError([{ path: 'body.minutes', message: 'Too big' }]);

    expect(toGatewayError(error)).toBe(error);
  });

  it('maps a framework 413 to PAYLOAD_TOO_LARGE', () => {
    expect(
      toGatewayError(
        Object.assign(new Error('Request body is too large'), {
          statusCode: STATUS.PAYLOAD_TOO_LARGE,
        }),
      ),
    ).toBeInstanceOf(PayloadTooLargeError);
  });

  it('keeps the status of other framework client errors but not their message', () => {
    const error = toGatewayError(
      Object.assign(new Error('Unexpected token "<script>" in JSON'), {
        statusCode: STATUS.UNSUPPORTED_MEDIA_TYPE,
      }),
    );

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.statusCode).toBe(STATUS.UNSUPPORTED_MEDIA_TYPE);
    expect(error.message).toBe('Bad request');
  });

  it.each([
    ['a plain error', new Error('database password is hunter2')],
    ['a 5xx error', Object.assign(new Error('boom'), { statusCode: STATUS.BAD_GATEWAY })],
    ['a non-numeric status', Object.assign(new Error('boom'), { statusCode: '400' })],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('maps %s to INTERNAL', (_name, thrown) => {
    expect(toGatewayError(thrown)).toBeInstanceOf(InternalError);
  });
});

describe('toErrorBody', () => {
  it('carries the code, the message and field issues only', () => {
    expect(
      toErrorBody(new ValidationError([{ path: 'query.date', message: 'Invalid date' }])),
    ).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        issues: [{ path: 'query.date', message: 'Invalid date' }],
      },
    });
    expect(toErrorBody(new InternalError())).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error' },
    });
  });
});
