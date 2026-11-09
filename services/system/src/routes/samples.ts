import { defineRoute, type Route } from '@yoman/service-kit/route';

import { SampleBatch, SampleResult } from '../contracts.js';
import { recordSamples } from '../use-cases/record-samples.js';
import type { RouteDeps } from './route-deps.js';

export function sampleRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'POST',
      url: '/samples',
      schema: { body: SampleBatch, response: SampleResult },
      handler: ({ body }) => recordSamples(store, body, now().getTime()),
    }),
  ];
}
