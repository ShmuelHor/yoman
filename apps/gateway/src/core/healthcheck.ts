/**
 * Docker `HEALTHCHECK` probe: exits 0 when `/health` answers 200. It names the
 * public host, because the gateway answers 421 to any other `Host` (SECURITY A4).
 * `node:http` rather than `fetch`, which does not let a caller set `Host`.
 */
import { request } from 'node:http';

import { ALLOWED_HOSTS } from './origins.js';

const DEFAULT_PORT = '8080';
const TIMEOUT_MS = 2_000;
const HTTP_OK = 200;
const EXIT_UNHEALTHY = 1;

const { PORT: port = DEFAULT_PORT } = process.env;
process.exitCode = EXIT_UNHEALTHY;

const probe = request(
  {
    host: '127.0.0.1',
    port,
    path: '/health',
    headers: { host: ALLOWED_HOSTS[0] },
    timeout: TIMEOUT_MS,
  },
  (response) => {
    process.exitCode = response.statusCode === HTTP_OK ? 0 : EXIT_UNHEALTHY;
    response.resume();
  },
);
probe.on('timeout', () => probe.destroy());
probe.on('error', () => {
  process.exitCode = EXIT_UNHEALTHY;
});
probe.end();
