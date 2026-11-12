import type { ServiceName } from '@yoman/shared/common';
import type { FastifyInstance } from 'fastify';

import { type RouteHandlers, toHandlerMap } from '../../src/core/route-handler.js';
import type { ServiceClient, ServiceMethod } from '../../src/core/service-client.js';
import type { SettingsStore } from '../../src/core/settings-store.js';
import { testGateway, webSession } from '../gateway-harness.js';
import { memorySettings } from '../memory-settings.js';

/** `sessions PUT /apps/code`: a service, a method and a path on it. */
export type CallKey = `${ServiceName} ${ServiceMethod} /${string}`;

export interface RecordedCall {
  readonly key: CallKey;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface FakeServices {
  readonly client: ServiceClient;
  readonly calls: RecordedCall[];
}

/**
 * A service client that answers from a table. A reply goes through the
 * request's own response schema, as the real client does, so a handler gets
 * exactly what it would from a service; an `Error` reply is thrown instead.
 * A call with no reply in the table fails, which the gateway turns into a 500.
 */
export function fakeServices(replies: Partial<Record<CallKey, unknown>>): FakeServices {
  const calls: RecordedCall[] = [];
  const client: ServiceClient = {
    call: (service, request) => {
      const key: CallKey = `${service} ${request.method} ${request.path}`;
      calls.push({
        key,
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      if (!(key in replies)) {
        return Promise.reject(new Error(`no fake reply for ${key}`));
      }
      const reply = replies[key];
      if (reply instanceof Error) {
        return Promise.reject(reply);
      }
      return Promise.resolve(request.response.parse(reply));
    },
  };
  return { client, calls };
}

export interface RouteHarness {
  readonly app: FastifyInstance;
  /** A signed-in web session's headers, CSRF token included. */
  readonly headers: Readonly<Record<string, string>>;
  readonly calls: RecordedCall[];
}

/** A gateway with only the given handlers, backed by fake services, and a web session on it. */
export async function routeHarness(
  handlers: RouteHandlers,
  replies: Partial<Record<CallKey, unknown>>,
  settings: SettingsStore = memorySettings(),
): Promise<RouteHarness> {
  const services = fakeServices(replies);
  const app = await testGateway({
    services: services.client,
    handlers: toHandlerMap(handlers),
    settings,
  });
  const { headers } = await webSession(app);
  return { app, headers, calls: services.calls };
}
