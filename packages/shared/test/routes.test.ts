import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type RouteContract, routes } from '../src/routes.js';

const all: [string, RouteContract][] = Object.entries(routes);
const paths = all.map(([, r]) => r.path);
const spec = readFileSync(new URL('../../../docs/SPEC.md', import.meta.url), 'utf8');

/** The backticked `/v1/...` entries on the gateway's "Public API (v1)" line. */
const publicApi = (): string[] => {
  const line = spec.split('\n').find((l) => l.includes('**Public API (v1):**')) ?? '';
  return [...line.matchAll(/`(\/v1\/[^`]+)`/g)].map((m) => m[1] ?? '');
};

/** The endpoint names on a service's `**API:**` line, for example `now` for `GET /now`. */
const serviceApi = (service: string): string[] => {
  const section = spec.split(`### ${service}\n`)[1]?.split('\n### ')[0] ?? '';
  const line = section.split('\n').find((l) => l.includes('**API:**')) ?? '';
  return [...line.matchAll(/\/([a-z-]+)/g)].map((m) => m[1] ?? '');
};

const NO_CONTENT = 204;

/** Service endpoints the gateway calls itself and never exposes (SPEC §3 flows). */
const INTERNAL = new Set(['samples', 'route']);

describe('route map', () => {
  it('covers every endpoint on the SPEC public API line', () => {
    const entries = publicApi();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      if (entry.endsWith('/*')) {
        const prefix = entry.slice(0, -1);
        expect(
          paths.some((p) => p.startsWith(prefix)),
          entry,
        ).toBe(true);
      } else {
        expect(paths, entry).toContain(entry);
      }
    }
  });

  it('has the web session bootstrap route from the SPEC authentication rules', () => {
    expect(spec).toContain('`GET /v1/session`');
    expect(routes.session).toMatchObject({ method: 'GET', path: '/v1/session' });
  });

  it.each(['battery', 'system', 'focus'])(
    'exposes every public %s endpoint under its /v1 prefix',
    (service) => {
      const names = serviceApi(service).filter((n) => !INTERNAL.has(n));
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(paths, name).toContain(`/v1/${service}/${name}`);
      }
    },
  );

  it('has one route per method and path', () => {
    const keys = all.map(([, r]) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives only the session bootstrap the origin-only auth', () => {
    expect(all.filter(([, r]) => r.auth === 'origin').map(([name]) => name)).toEqual(['session']);
  });

  it.each(all)('%s declares a params schema exactly when its path has parameters', (_, r) => {
    expect(r.path.includes('/:')).toBe(r.params !== undefined);
  });

  it.each(all)('%s answers 204 exactly when it has no response body', (_, r) => {
    expect(r.status === NO_CONTENT).toBe(r.response === null);
  });

  it.each(all)('%s takes a body only on POST and PUT', (_, r) => {
    if (r.body !== undefined) {
      expect(['POST', 'PUT']).toContain(r.method);
    }
  });
});
