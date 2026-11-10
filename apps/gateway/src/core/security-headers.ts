import type { FastifyHelmetOptions } from '@fastify/helmet';

const NONE = ["'none'"];

/**
 * Headers on every gateway response, errors included (SECURITY A6, ST07),
 * applied by `@fastify/helmet`. The gateway serves only JSON, so its CSP
 * allows nothing at all: a response that a browser is tricked into rendering
 * as a page can load and run nothing.
 */
export const HELMET_OPTIONS: FastifyHelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: NONE,
      baseUri: NONE,
      formAction: NONE,
      frameAncestors: NONE,
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  xFrameOptions: { action: 'deny' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Blocks no-cors embedding (<img>, <script>) from other origins; CORS fetches are unaffected.
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // Plain HTTP on loopback: HSTS means nothing here and must not pin `localhost` for other apps.
  strictTransportSecurity: false,
};

/** Responses carry personal activity data, so no browser or proxy may keep a copy. */
export const CACHE_CONTROL = 'no-store';
