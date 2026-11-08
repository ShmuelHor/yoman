/**
 * Docker `HEALTHCHECK` probe: exits 0 when `/health` answers 2xx. Node is the
 * only binary the image needs, so there is no curl or wget to keep patched.
 */
const DEFAULT_PORT = '8080';
const TIMEOUT_MS = 2_000;
const EXIT_UNHEALTHY = 1;

const { PORT: port = DEFAULT_PORT } = process.env;

try {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  process.exitCode = response.ok ? 0 : EXIT_UNHEALTHY;
} catch {
  process.exitCode = EXIT_UNHEALTHY;
}
