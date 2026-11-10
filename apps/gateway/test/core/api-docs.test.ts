import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { testGateway } from '../gateway-harness.js';
import { GATEWAY_HOST, STATUS } from '../harness.js';

const OpenApiDocument = z.object({
  openapi: z.string(),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
});

describe('API docs', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves an OpenAPI document generated from every contract route', async () => {
    app = await testGateway({ apiDocs: true });

    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
      headers: { host: GATEWAY_HOST },
    });

    expect(response.statusCode).toBe(STATUS.OK);
    const document = OpenApiDocument.parse(response.json());
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths['/v1/ingest'] ?? {})).toEqual(['post']);
    expect(document.paths['/v1/rules/{id}']).toHaveProperty('delete');
  });

  it('serves Swagger UI with a CSP that allows only its own files', async () => {
    app = await testGateway({ apiDocs: true });

    const response = await app.inject({
      method: 'GET',
      url: '/docs',
      headers: { host: GATEWAY_HOST },
    });

    expect(response.statusCode).toBe(STATUS.OK);
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe');
  });

  it('serves no docs unless asked to', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
      headers: { host: GATEWAY_HOST },
    });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });
});
