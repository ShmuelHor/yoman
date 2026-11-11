/**
 * Stops the Docker stack. Data stays in the `pgdata` volume.
 *
 * Usage: npm stop
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { toExitOutcome } from './lib/child-exit.js';
import { STOP_STEP } from './lib/start-plan.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXIT_FAILURE = 1;

const child = spawn(STOP_STEP.command, [...STOP_STEP.args], { cwd: ROOT, stdio: 'inherit' });
child.on('error', (error) => {
  process.stderr.write(`Could not run ${STOP_STEP.command}: ${error.name}\n`);
  process.exitCode = EXIT_FAILURE;
});
child.on('exit', (code, signal) => {
  const outcome = toExitOutcome(STOP_STEP.command, { code, signal });
  if (outcome.message !== undefined) {
    process.stderr.write(`${outcome.message}\n`);
  }
  process.exitCode = outcome.exitCode;
});
