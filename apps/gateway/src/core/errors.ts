import type { FastifyError } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * Typed gateway errors with stable codes. The code is part of the public API;
 * the message is fixed per class, so a client never sees a stack, an upstream
 * body or its own rejected input echoed back.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'MISDIRECTED_REQUEST'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_UNAVAILABLE';

export const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
export const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_MISDIRECTED = 421;
const HTTP_TOO_MANY_REQUESTS = 429;
export const HTTP_INTERNAL = 500;
const HTTP_NOT_IMPLEMENTED = 501;
const HTTP_SERVICE_UNAVAILABLE = 503;

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export class GatewayError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    readonly issues?: readonly FieldIssue[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends GatewayError {
  constructor(issues: readonly FieldIssue[]) {
    super('VALIDATION_FAILED', HTTP_BAD_REQUEST, 'Request validation failed', issues);
  }
}

/** A client error raised by Fastify itself (malformed JSON, wrong content type). */
export class BadRequestError extends GatewayError {
  constructor(statusCode = HTTP_BAD_REQUEST) {
    super('BAD_REQUEST', statusCode, 'Bad request');
  }
}

export class UnauthorizedError extends GatewayError {
  constructor() {
    super('UNAUTHORIZED', HTTP_UNAUTHORIZED, 'Unauthorized');
  }
}

export class ForbiddenError extends GatewayError {
  constructor() {
    super('FORBIDDEN', HTTP_FORBIDDEN, 'Forbidden');
  }
}

export class NotFoundError extends GatewayError {
  constructor() {
    super('NOT_FOUND', HTTP_NOT_FOUND, 'Not found');
  }
}

export class ConflictError extends GatewayError {
  constructor() {
    super('CONFLICT', HTTP_CONFLICT, 'Conflict');
  }
}

export class PayloadTooLargeError extends GatewayError {
  constructor() {
    super('PAYLOAD_TOO_LARGE', HTTP_PAYLOAD_TOO_LARGE, 'Payload too large');
  }
}

/** SECURITY A4: the request named a host this server does not answer for. */
export class MisdirectedRequestError extends GatewayError {
  constructor() {
    super('MISDIRECTED_REQUEST', HTTP_MISDIRECTED, 'Misdirected request');
  }
}

export class RateLimitedError extends GatewayError {
  constructor() {
    super('RATE_LIMITED', HTTP_TOO_MANY_REQUESTS, 'Too many requests');
  }
}

export class InternalError extends GatewayError {
  constructor() {
    super('INTERNAL', HTTP_INTERNAL, 'Internal error');
  }
}

/** A contract route whose handler has not been written yet. */
export class NotImplementedError extends GatewayError {
  constructor() {
    super('NOT_IMPLEMENTED', HTTP_NOT_IMPLEMENTED, 'Not implemented');
  }
}

/** Why a service call failed. Logged for operators, never sent to clients. */
export type ServiceFailure = 'timeout' | 'unreachable' | 'status' | 'invalid-response';

export class ServiceUnavailableError extends GatewayError {
  constructor(
    readonly service: string,
    readonly reason: ServiceFailure,
  ) {
    super('SERVICE_UNAVAILABLE', HTTP_SERVICE_UNAVAILABLE, 'Service unavailable');
  }
}

/** The body clients see for every error. */
export interface ErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly issues?: readonly FieldIssue[];
    /** Ties the response to every log line of the request, in every service. */
    readonly requestId?: string;
  };
}

export function toErrorBody(error: GatewayError, requestId?: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(requestId === undefined ? {} : { requestId }),
      ...(error.issues === undefined ? {} : { issues: error.issues }),
    },
  };
}

function statusCodeOf(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return HTTP_INTERNAL;
  }
  return typeof error.statusCode === 'number' ? error.statusCode : HTTP_INTERNAL;
}

/** Fastify's name for the request part a validator rejected. */
type RequestPart = NonNullable<FastifyError['validationContext']>;

/** Error paths name the request part as the contract does: `query.days`, not `querystring.days`. */
const PART_NAMES: Readonly<Record<RequestPart, string>> = {
  params: 'params',
  querystring: 'query',
  body: 'body',
  headers: 'headers',
};

/** A schema path such as `/samples/0/appId`, as segments. */
function pathSegments(instancePath: string): string[] {
  return instancePath.split('/').filter((segment) => segment !== '');
}

/**
 * A request part rejected by its contract, as found by the Zod validator
 * compiler. Field paths and Zod's messages only: Zod 4 messages never echo
 * the rejected value.
 */
function toValidationError(error: unknown): ValidationError | undefined {
  if (!hasZodFastifySchemaValidationErrors(error)) {
    return undefined;
  }
  const part = error.validationContext === undefined ? [] : [PART_NAMES[error.validationContext]];
  return new ValidationError(
    error.validation.map((issue) => ({
      path: [...part, ...pathSegments(issue.instancePath)].join('.'),
      message: issue.message ?? 'Invalid input',
    })),
  );
}

/**
 * Maps any thrown value to a gateway error. Fastify's own 4xx errors keep their
 * status but lose their message, which can quote the rejected input.
 */
export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }
  const invalid = toValidationError(error);
  if (invalid !== undefined) {
    return invalid;
  }
  const status = statusCodeOf(error);
  if (status === HTTP_PAYLOAD_TOO_LARGE) {
    return new PayloadTooLargeError();
  }
  if (status >= HTTP_BAD_REQUEST && status < HTTP_INTERNAL) {
    return new BadRequestError(status);
  }
  return new InternalError();
}
