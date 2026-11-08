import type { ZodError, ZodType } from 'zod';

import { type FieldIssue, ValidationError } from './errors.js';

/** Field paths and Zod's messages only. Zod 4 messages never echo the rejected input. */
export function toFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** Parses a request part, or throws a 400 `ValidationError` with field paths. */
export function parseRequestPart<T>(schema: ZodType<T>, part: string, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new ValidationError(
    toFieldIssues(result.error).map((issue) => ({
      path: issue.path === '' ? part : `${part}.${issue.path}`,
      message: issue.message,
    })),
  );
}
