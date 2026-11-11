import { fileURLToPath } from 'node:url';

import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { routes } from '@yoman/shared/routes';
import fc from 'fast-check';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { HandledRouteName, HandlerMap } from '../../apps/gateway/src/core/route-handler.js';
import { loadRouteHandlers } from '../../apps/gateway/src/core/route-loader.js';
import {
  type ContractRoute,
  contractRoutes,
  credentialsFor,
  NO_RATE_LIMIT,
  pathWith,
  STATUS,
  securityGateway,
} from './lib/gateway.js';

/** SECURITY ST08: 50 invalid inputs per route. */
const RUNS_PER_ROUTE = 50;
/** A fixed seed keeps CI reproducible; a failure prints the counterexample to replay. */
const SEED = 4711;
const MAX_TEXT = 64;
const MAX_KEYS = 4;

/** What the gateway checks a part against when the contract has no schema for it. */
const NO_PARAMS = z.strictObject({});
const NO_BODY = z.undefined();
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'DELETE']);
/** The gateway's route modules, loaded as `startGateway` loads them. */
const ROUTES_DIR = fileURLToPath(new URL('../../apps/gateway/src/routes/', import.meta.url));

const T27_ROUTES: readonly HandledRouteName[] = ['ingest'];

/** The routes each route task implements, fuzzed again with their real handlers in place. */
const T28_ROUTES: readonly HandledRouteName[] = [
  'dashboardToday',
  'week',
  'listApps',
  'updateApp',
  'listRules',
  'createRule',
  'updateRule',
  'deleteRule',
  'listGoals',
  'createGoal',
  'updateGoal',
  'deleteGoal',
  'goalProgress',
];

const T29_ROUTES: readonly HandledRouteName[] = [
  'batteryNow',
  'batteryHealthTrend',
  'batteryPowerByApp',
  'systemIncidents',
  'systemCulprits',
  'systemTimeline',
];

interface HandledRoute extends ContractRoute {
  readonly name: HandledRouteName;
}

function routesNamed(names: readonly HandledRouteName[]): HandledRoute[] {
  return names.map((name) => ({ name, contract: routes[name] }));
}

interface Input {
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  /** `undefined` sends no body at all. */
  readonly body: unknown;
}

const text = fc.string({ unit: 'grapheme', maxLength: MAX_TEXT });
const queryRecord = fc.dictionary(text, text, { maxKeys: MAX_KEYS });

/** A JSON value, or the valid fixture with one field (at any depth) replaced by one. */
function bodyArbitrary(valid: unknown): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.jsonValue(),
    fc.jsonValue().chain((value) => replaceSomewhere(valid, value)),
  );
}

function replaceSomewhere(target: unknown, value: unknown): fc.Arbitrary<unknown> {
  if (typeof target !== 'object' || target === null) {
    return fc.constant(value);
  }
  const keys = Object.keys(target);
  if (keys.length === 0) {
    return fc.constant(value);
  }
  return fc
    .constantFrom(...keys)
    .chain((key) =>
      fc
        .oneof(fc.constant(value), replaceSomewhere(Reflect.get(target, key), value))
        .map((child) =>
          Array.isArray(target)
            ? target.map((item, index) => (String(index) === key ? child : item))
            : { ...target, [key]: child },
        ),
    );
}

function isValid(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

/**
 * Inputs the route's own contract rejects: one part at a time is broken, the
 * others stay valid, so a 400 can only come from the broken part.
 */
function invalidInputs({ name, contract }: ContractRoute): fc.Arbitrary<Input> {
  const fixture = requestFixtures[name];
  const valid: Input = {
    params: fixture.params ?? {},
    query: fixture.query ?? {},
    body: fixture.body,
  };
  const paramsSchema = contract.params ?? NO_PARAMS;
  const querySchema = contract.query ?? NO_PARAMS;
  const bodySchema = contract.body ?? NO_BODY;

  const brokenQuery = fc
    .oneof(
      queryRecord,
      queryRecord.map((extra) => ({ ...valid.query, ...extra })),
    )
    .filter((query) => !isValid(querySchema, query))
    .map((query): Input => ({ ...valid, query }));
  const parts: fc.Arbitrary<Input>[] = [brokenQuery];

  const paramNames = Object.keys(valid.params);
  if (paramNames.length > 0) {
    parts.push(
      fc
        .record(Object.fromEntries(paramNames.map((key) => [key, text])))
        // An empty or dot segment never reaches the route: the router answers 404.
        .filter((params) =>
          Object.values(params).every((value) => !['', '.', '..'].includes(value)),
        )
        .filter((params) => !isValid(paramsSchema, params))
        .map((params): Input => ({ ...valid, params })),
    );
  }
  if (METHODS_WITH_BODY.has(contract.method)) {
    parts.push(
      bodyArbitrary(valid.body)
        .filter((body) => !isValid(bodySchema, body))
        .map((body): Input => ({ ...valid, body })),
    );
  }
  return fc.oneof(...parts);
}

function toRequest(
  route: ContractRoute,
  input: Input,
  headers: Record<string, string>,
): InjectOptions {
  const query = new URLSearchParams(Object.entries(input.query)).toString();
  const hasBody = input.body !== undefined;
  return {
    method: route.contract.method,
    url: `${pathWith(route.contract, input.params)}${query === '' ? '' : `?${query}`}`,
    headers: hasBody ? { ...headers, 'content-type': 'application/json' } : headers,
    ...(hasBody ? { payload: JSON.stringify(input.body) } : {}),
  };
}

async function fuzzRoute(app: FastifyInstance, route: ContractRoute): Promise<void> {
  const headers = await credentialsFor(app, route.contract);

  await fc.assert(
    fc.asyncProperty(invalidInputs(route), async (input) => {
      const response = await app.inject(toRequest(route, input, headers));

      expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
    }),
    { numRuns: RUNS_PER_ROUTE, seed: SEED },
  );
}

describe('ST08 route fuzzing', () => {
  let app: FastifyInstance;
  /** The same gateway with every route module under `src/routes` loaded. */
  let handled: FastifyInstance;
  let handlers: HandlerMap;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
    handlers = await loadRouteHandlers({ dir: ROUTES_DIR });
    handled = await securityGateway({ rateLimits: NO_RATE_LIMIT, handlers });
  });

  afterAll(async () => {
    await app.close();
    await handled.close();
  });

  it.each(contractRoutes)(
    '50 invalid inputs per route, generated from its zod schema, return 400 and never 500: $name',
    async (route) => {
      await fuzzRoute(app, route);
    },
  );

  it.each(routesNamed(T27_ROUTES))(
    'ingest route passes the fuzzing check with its handler: $name',
    async (route) => {
      expect(handlers.has(route.name)).toBe(true);

      await fuzzRoute(handled, route);
    },
  );
  it.each(routesNamed(T28_ROUTES))(
    'dashboard, reports, apps, rules and goals routes pass the fuzzing check with their handlers: $name',
    async (route) => {
      expect(handlers.has(route.name)).toBe(true);

      await fuzzRoute(handled, route);
    },
  );
  it.each(routesNamed(T29_ROUTES))(
    'battery and system routes pass the fuzzing check with their handlers: $name',
    async (route) => {
      expect(handlers.has(route.name)).toBe(true);

      await fuzzRoute(handled, route);
    },
  );
  it.todo('[T30] focus routes pass the fuzzing check');
  it.todo('[T31] settings routes pass the fuzzing check');
});
