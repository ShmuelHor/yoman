import { FIXTURE_IDS, ruleFixture } from '@yoman/shared/fixtures/data';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../../../src/core/errors.js';
import { ruleHandlers } from '../../../src/routes/apps/rules.js';
import { STATUS } from '../../harness.js';
import { type CallKey, type RouteHarness, routeHarness } from '../route-harness.js';

const { id: _id, ...ruleInput } = ruleFixture;
const RULE_PATH = `/rules/${FIXTURE_IDS.rule}`;
const JSON_HEADERS = { 'content-type': 'application/json' };

describe('rule routes', () => {
  let harness: RouteHarness | undefined;

  afterEach(async () => {
    await harness?.app.close();
    harness = undefined;
  });

  async function start(replies: Partial<Record<CallKey, unknown>>): Promise<RouteHarness> {
    harness = await routeHarness(ruleHandlers, replies);
    return harness;
  }

  it('lists the rules', async () => {
    const { app, headers } = await start({ 'sessions GET /rules': responseFixtures.listRules });

    const response = await app.inject({ method: 'GET', url: '/v1/rules', headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.listRules);
  });

  it('creates a rule with the validated body and answers 201', async () => {
    const { app, headers, calls } = await start({ 'sessions POST /rules': ruleFixture });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/rules',
      headers: { ...headers, ...JSON_HEADERS },
      payload: ruleInput,
    });

    expect(response.statusCode).toBe(STATUS.CREATED);
    expect(response.json()).toEqual(ruleFixture);
    expect(calls).toEqual([{ key: 'sessions POST /rules', body: ruleInput }]);
  });

  it('updates the rule named in the path', async () => {
    const { app, headers, calls } = await start({ [`sessions PUT ${RULE_PATH}`]: ruleFixture });

    const response = await app.inject({
      method: 'PUT',
      url: `/v1${RULE_PATH}`,
      headers: { ...headers, ...JSON_HEADERS },
      payload: ruleInput,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(calls).toEqual([{ key: `sessions PUT ${RULE_PATH}`, body: ruleInput }]);
  });

  it('deletes a rule and answers 204 with no body', async () => {
    const { app, headers, calls } = await start({ [`sessions DELETE ${RULE_PATH}`]: undefined });

    const response = await app.inject({ method: 'DELETE', url: `/v1${RULE_PATH}`, headers });

    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(response.body).toBe('');
    expect(calls).toEqual([{ key: `sessions DELETE ${RULE_PATH}` }]);
  });

  it('answers 404 when deleting a rule that does not exist', async () => {
    const { app, headers } = await start({ [`sessions DELETE ${RULE_PATH}`]: new NotFoundError() });

    const response = await app.inject({ method: 'DELETE', url: `/v1${RULE_PATH}`, headers });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });
});
