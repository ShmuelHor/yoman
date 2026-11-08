import { z } from 'zod';

/** The fields of a Node.js system error that our scripts report. */
const SystemError = z.object({ code: z.string().optional(), message: z.string() });

/** Parses an unknown caught value into its `code` and `message`; throws if it is not an error shape. */
export function parseSystemError(error: unknown): z.infer<typeof SystemError> {
  return SystemError.parse(error);
}
