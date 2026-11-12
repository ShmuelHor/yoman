import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { buildGateway, type GatewayOptions } from '../src/core/app.js';
import type { ServiceClient } from '../src/core/service-client.js';
import { AGENT_TOKEN, GATEWAY_HOST, silentLogger, WEB_ORIGIN } from './harness.js';
import { memorySettings } from './memory-settings.js';

export const noServices: ServiceClient = {
  call: () => Promise.reject(new Error('this test calls no service')),
};

export function testGateway(options: Partial<GatewayOptions> = {}): Promise<FastifyInstance> {
  return buildGateway({
    logger: silentLogger,
    agentToken: AGENT_TOKEN,
    services: noServices,
    settings: memorySettings(),
    ...options,
  });
}

export const agentHeaders = { host: GATEWAY_HOST, authorization: `Bearer ${AGENT_TOKEN}` };

export interface WebSession {
  readonly headers: Readonly<Record<string, string>>;
  readonly csrfToken: string;
}

function cookieValue(response: LightMyRequestResponse, name: string): string {
  const cookie = response.cookies.find((candidate) => candidate.name === name);
  if (cookie === undefined) {
    throw new Error(`the response set no ${name} cookie`);
  }
  return cookie.value;
}

/** Signs in as the web: `GET /v1/session`, then the headers a write needs. */
export async function webSession(app: FastifyInstance): Promise<WebSession> {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/session',
    headers: { host: GATEWAY_HOST, origin: WEB_ORIGIN },
  });
  const { csrfToken } = response.json<{ csrfToken: string }>();
  return {
    csrfToken,
    headers: {
      host: GATEWAY_HOST,
      origin: WEB_ORIGIN,
      cookie: `yoman_session=${cookieValue(response, 'yoman_session')}`,
      'x-csrf-token': csrfToken,
    },
  };
}
