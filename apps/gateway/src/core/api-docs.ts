import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

import { SESSION_COOKIE } from './authenticate.js';

/** The interactive docs, and the OpenAPI document at `/docs/json`. */
export const API_DOCS_PREFIX = '/docs';

/**
 * The docs page loads only its own bundled script and styles. It replaces the
 * gateway's allow-nothing CSP on these routes only, and only in development.
 */
const DOCS_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
].join('; ');

/**
 * Serves the OpenAPI document generated from the contracts' Zod schemas, and
 * Swagger UI for it. Development only: both plugins are dev dependencies,
 * imported here on demand, so the production image never contains them.
 * Must run before any route is registered, so every route is documented.
 */
export async function registerApiDocs(app: FastifyInstance): Promise<void> {
  const { default: swagger } = await import('@fastify/swagger');
  const { default: swaggerUi } = await import('@fastify/swagger-ui');
  await app.register(swagger, {
    openapi: {
      info: { title: 'Yoman gateway', version: '1' },
      components: {
        securitySchemes: {
          agentToken: { type: 'http', scheme: 'bearer' },
          webSession: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: API_DOCS_PREFIX, staticCSP: DOCS_CSP });
}
