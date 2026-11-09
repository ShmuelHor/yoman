import { fileURLToPath } from 'node:url';

import { startGateway } from './server.js';

const EXIT_FAILURE = 1;

try {
  await startGateway({ routesDir: fileURLToPath(new URL('../routes/', import.meta.url)) });
} catch {
  // `startGateway` already logged the cause.
  process.exitCode = EXIT_FAILURE;
}
