import { type HttpHandler, HttpResponse, http } from 'msw';
import { z } from 'zod';
import { type ResponseFixtures, responseFixtures } from './fixtures/responses.js';
import { type RouteContract, type RouteName, routes } from './routes.js';

const BAD_REQUEST = 400;

/** Routes without a query schema accept no query string. */
const NO_QUERY = z.strictObject({});

/** The gateway's error body for input that fails its contract. */
export const invalidRequestBody = { error: 'invalid_request' } as const;

const isValid = (schema: z.ZodType | undefined, value: unknown): boolean =>
  schema === undefined || schema.safeParse(value).success;

const readBody = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return Symbol('malformed JSON');
  }
};

const handlerFor = (
  name: RouteName,
  route: RouteContract,
  baseUrl: string,
  fixtures: ResponseFixtures,
): HttpHandler => {
  const method = route.method.toLowerCase() as Lowercase<RouteContract['method']>;
  return http[method](`${baseUrl}${route.path}`, async ({ request, params }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const body = await readBody(request);
    const valid =
      isValid(route.params, params) &&
      isValid(route.query ?? NO_QUERY, query) &&
      (route.body === undefined ? body === undefined : isValid(route.body, body));
    if (!valid) {
      return HttpResponse.json(invalidRequestBody, { status: BAD_REQUEST });
    }
    if (route.response === null) {
      return new HttpResponse(null, { status: route.status });
    }
    return HttpResponse.json(fixtures[name], { status: route.status });
  });
};

/**
 * MSW handlers for every route in the map, serving the response fixtures. Requests
 * are checked against the same contracts as the gateway, so an invalid call from the
 * web fails in tests and demo mode just as it would against the real backend.
 * Authentication is not simulated.
 */
export const createHandlers = (
  baseUrl = '',
  fixtures: ResponseFixtures = responseFixtures,
): HttpHandler[] =>
  (Object.entries(routes) as [RouteName, RouteContract][]).map(([name, route]) =>
    handlerFor(name, route, baseUrl, fixtures),
  );
