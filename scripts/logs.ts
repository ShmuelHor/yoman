/**
 * Follows the logs of the compose stack, one readable line each, with the
 * service as a column. JSON lines are pretty-printed; others pass through.
 *
 * Usage: npm run logs [-- <service>...]
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  createPrettify,
  formatComposeLine,
  parseServices,
  UnknownServiceError,
} from './lib/compose-logs.js';

const EXIT_FAILURE = 1;

function run(services: readonly string[]): void {
  const prettify = createPrettify();
  const child = spawn('docker', ['compose', 'logs', '--follow', '--no-color', ...services], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    process.stdout.write(`${formatComposeLine(line, prettify)}\n`);
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? EXIT_FAILURE;
  });
}

try {
  run(parseServices(process.argv.slice(2)));
} catch (error: unknown) {
  if (!(error instanceof UnknownServiceError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = EXIT_FAILURE;
}
