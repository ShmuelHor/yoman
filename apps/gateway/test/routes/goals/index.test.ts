import { FIXTURE_DATE, FIXTURE_IDS, goalFixture } from '@yoman/shared/fixtures/data';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError, ServiceUnavailableError } from '../../../src/core/errors.js';
import { handlers } from '../../../src/routes/goals/index.js';
import { STATUS } from '../../harness.js';
import { type CallKey, type RouteHarness, routeHarness } from '../route-harness.js';

const { id: _id, ...goalInput } = goalFixture;
const GOAL_PATH = `/goals/${FIXTURE_IDS.goal}`;
const JSON_HEADERS = { 'content-type': 'application/json' };

describe('goal routes', () => {
  let harness: RouteHarness | undefined;

  afterEach(async () => {
    await harness?.app.close();
    harness = undefined;
  });

  async function start(replies: Partial<Record<CallKey, unknown>>): Promise<RouteHarness> {
    harness = await routeHarness(handlers, replies);
    return harness;
  }

  function app(): FastifyInstance {
    if (harness === undefined) {
      throw new Error('call start() first');
    }
    return harness.app;
  }

  it('lists the goals', async () => {
    const { headers } = await start({ 'goals GET /goals': responseFixtures.listGoals });

    const response = await app().inject({ method: 'GET', url: '/v1/goals', headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.listGoals);
  });

  it('creates a goal with the validated body and answers 201', async () => {
    const { headers, calls } = await start({ 'goals POST /goals': goalFixture });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/goals',
      headers: { ...headers, ...JSON_HEADERS },
      payload: goalInput,
    });

    expect(response.statusCode).toBe(STATUS.CREATED);
    expect(response.json()).toEqual(goalFixture);
    expect(calls).toEqual([{ key: 'goals POST /goals', body: goalInput }]);
  });

  it('updates the goal named in the path', async () => {
    const { headers, calls } = await start({ [`goals PUT ${GOAL_PATH}`]: goalFixture });

    const response = await app().inject({
      method: 'PUT',
      url: `/v1${GOAL_PATH}`,
      headers: { ...headers, ...JSON_HEADERS },
      payload: goalInput,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(calls).toEqual([{ key: `goals PUT ${GOAL_PATH}`, body: goalInput }]);
  });

  it('answers 404 when the goals service has no such goal', async () => {
    const { headers } = await start({ [`goals PUT ${GOAL_PATH}`]: new NotFoundError() });

    const response = await app().inject({
      method: 'PUT',
      url: `/v1${GOAL_PATH}`,
      headers: { ...headers, ...JSON_HEADERS },
      payload: goalInput,
    });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });

  it('deletes a goal and answers 204 with no body', async () => {
    const { headers, calls } = await start({ [`goals DELETE ${GOAL_PATH}`]: undefined });

    const response = await app().inject({ method: 'DELETE', url: `/v1${GOAL_PATH}`, headers });

    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(response.body).toBe('');
    expect(calls).toEqual([{ key: `goals DELETE ${GOAL_PATH}` }]);
  });

  it("returns a day's progress for the requested date", async () => {
    const { headers, calls } = await start({
      'goals GET /progress': responseFixtures.goalProgress,
    });

    const response = await app().inject({
      method: 'GET',
      url: `/v1/goals/progress?date=${FIXTURE_DATE}`,
      headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.goalProgress);
    expect(calls).toEqual([{ key: 'goals GET /progress', query: { date: FIXTURE_DATE } }]);
  });

  it('answers 503 when the goals service is down', async () => {
    const { headers } = await start({
      'goals GET /goals': new ServiceUnavailableError('goals', 'unreachable'),
    });

    const response = await app().inject({ method: 'GET', url: '/v1/goals', headers });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
  });
});
