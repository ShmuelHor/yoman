import { describe, expect, it } from 'vitest';
import { type RouteContract, type RouteName, routes } from '../routes.js';
import { requestFixtures } from './requests.js';
import { responseFixtures } from './responses.js';

const all = Object.entries(routes) as [RouteName, RouteContract][];

describe('fixtures', () => {
  it.each(all)('%s response fixture satisfies its contract', (name, route) => {
    const fixture = responseFixtures[name];
    if (route.response === null) {
      expect(fixture).toBeNull();
    } else {
      expect(route.response.parse(fixture)).toEqual(fixture);
    }
  });

  it.each(all)('%s request fixture satisfies its contract', (name, route) => {
    const request = requestFixtures[name];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = route[part];
      if (schema === undefined) {
        expect(request[part], part).toBeUndefined();
      } else {
        expect(schema.safeParse(request[part]).success, part).toBe(true);
      }
    }
  });
});
