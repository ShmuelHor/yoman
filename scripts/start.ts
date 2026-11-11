/**
 * Starts everything: `.env` if missing, the Docker stack (waits until it is
 * healthy), then the agent in this terminal. Ctrl+C stops the agent; the stack
 * keeps running until `npm stop`.
 *
 * Usage: npm start
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { toExitOutcome } from './lib/child-exit.js';
import { AGENT_COMMAND, planStartSteps, type StartStep, WEB_URL } from './lib/start-plan.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
const EXIT_FAILURE = 1;

function runToExit(step: Pick<StartStep, 'command' | 'args'>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(step.command, [...step.args], { cwd: ROOT, stdio: 'inherit' });
    child.on('error', (error) => {
      process.stderr.write(`Could not run ${step.command}: ${error.name}\n`);
      resolve(EXIT_FAILURE);
    });
    child.on('exit', (code, signal) => {
      const outcome = toExitOutcome(step.command, { code, signal });
      if (outcome.message !== undefined) {
        process.stderr.write(`${outcome.message}\n`);
      }
      resolve(outcome.exitCode);
    });
  });
}

async function main(): Promise<number> {
  for (const step of planStartSteps({ envExists: existsSync(ENV_PATH) })) {
    process.stdout.write(`${step.label}...\n`);
    const code = await runToExit(step);
    if (code !== 0) {
      process.stderr.write(`${step.label} failed. Nothing else was started.\n`);
      return code;
    }
  }
  process.stdout.write(
    `Yoman is up: ${WEB_URL}\nRunning the agent. Ctrl+C stops it; \`npm stop\` stops the stack.\n`,
  );
  // Ctrl+C reaches the agent through the terminal's process group; this
  // process stays up until the agent has restored what it changed.
  process.on('SIGINT', () => undefined);
  return runToExit(AGENT_COMMAND);
}

process.exitCode = await main();
