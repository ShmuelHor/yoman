/** Typed errors with stable codes. The code is part of the API; the message is for humans. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
export const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
export const HTTP_INTERNAL = 500;

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export class AppError extends Error {
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

export class ValidationError extends AppError {
  constructor(issues: readonly FieldIssue[]) {
    super('VALIDATION_FAILED', HTTP_BAD_REQUEST, 'Request validation failed', issues);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', HTTP_NOT_FOUND, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('CONFLICT', HTTP_CONFLICT, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', HTTP_UNAUTHORIZED, message);
  }
}

/**
 * A client error raised by the framework itself (malformed JSON, body too
 * large, wrong content type). Its message is fixed: Fastify's own message
 * can quote the rejected input.
 */
export class BadRequestError extends AppError {
  constructor(statusCode: number) {
    super('BAD_REQUEST', statusCode, 'Bad request');
  }
}

export class InternalError extends AppError {
  constructor() {
    super('INTERNAL', HTTP_INTERNAL, 'Internal error');
  }
}

/** The body clients see. It never carries a stack, a SQL fragment or the rejected value. */
export interface ErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly issues?: readonly FieldIssue[];
    /** Ties the response to the service's log lines. */
    readonly requestId?: string;
  };
}

export function toErrorBody(error: AppError, requestId?: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(requestId === undefined ? {} : { requestId }),
      ...(error.issues === undefined ? {} : { issues: error.issues }),
    },
  };
}
