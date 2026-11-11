import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Authenticator } from './authenticate.js';
import { afterAuthentication, authenticateRequest, type RateLimit } from './contract-routes.js';
import { ValidationError } from './errors.js';
import { isValidRequestId } from './request-id.js';

export const CLIENT_ERRORS_PATH = '/v1/client-errors';
/** One error report per two seconds on average, so a render loop cannot flood the log. */
export const CLIENT_ERRORS_RATE_LIMIT: RateLimit = { max: 30, timeWindow: 60_000 };
const HTTP_NO_CONTENT = 204;
/** A report is a few short fields; 2 KB is generous and far below the global 1 MB. */
const CLIENT_ERRORS_BODY_LIMIT = 2_048;
const MAX_ROUTE_LENGTH = 200;
const MAX_ERROR_NAME_LENGTH = 100;
const MIN_HTTP_STATUS = 100;
const MAX_HTTP_STATUS = 599;

/**
 * What the web reports about its own failures. There is no free-text field on
 * purpose: a message can quote a window title or other user data, and the log
 * must never hold those. Everything here is an enum, a path or a name.
 */
export const ClientErrorReport = z.strictObject({
  kind: z.enum(['request-failed', 'render-crash', 'unhandled']),
  /** The `x-request-id` of the failed request, to join the web's line to the server's. */
  reqId: z.string().refine(isValidRequestId, { message: 'Invalid request id' }).optional(),
  /** The API route that failed, as a path without a query string. */
  route: z
    .string()
    .max(MAX_ROUTE_LENGTH)
    .regex(/^\/[A-Za-z0-9/_:.-]*$/)
    .optional(),
  status: z.number().int().min(MIN_HTTP_STATUS).max(MAX_HTTP_STATUS).optional(),
  errorName: z
    .string()
    .max(MAX_ERROR_NAME_LENGTH)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
    .optional(),
});
export type ClientErrorReport = z.infer<typeof ClientErrorReport>;

/**
 * `POST /v1/client-errors`: the web reports failures here so every log lives in
 * one place (`docker compose logs`). Session and CSRF protected, tiny and rate
 * limited. Not in `packages/shared` yet; the web client will import its type
 * from there once the contract moves.
 */
export function registerClientErrorRoute(app: FastifyInstance, auth: Authenticator): void {
  app.post(
    CLIENT_ERRORS_PATH,
    {
      bodyLimit: CLIENT_ERRORS_BODY_LIMIT,
      config: { rateLimit: afterAuthentication(CLIENT_ERRORS_RATE_LIMIT) },
      // Before the body is read, like every contract route.
      preParsing: async (request, _reply, payload) => {
        authenticateRequest(auth, 'session', request);
        return payload;
      },
    },
    async (request, reply) => {
      const report = ClientErrorReport.safeParse(request.body);
      if (!report.success) {
        throw new ValidationError(
          report.error.issues.map((issue) => ({
            path: ['body', ...issue.path.map(String)].join('.'),
            message: issue.message,
          })),
        );
      }
      const { reqId, kind, ...fields } = report.data;
      // The failed request's own id wins over this report's, so one grep shows the whole story.
      const log = request.log.child({ source: 'web', ...(reqId === undefined ? {} : { reqId }) });
      log.error({ kind, ...fields }, 'request failed');
      return reply.status(HTTP_NO_CONTENT).send();
    },
  );
}
