import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ComposeModel } from './compose-policy.js';

const run = promisify(execFile);

/** 16 MiB. Compose output for a full project stays far below this; the cap only guards against runaway output. */
const MAX_OUTPUT_BYTES = 16_777_216;

/**
 * Resolves a Compose file with `docker compose config --format json` and
 * validates the result. This needs only the Compose CLI, not a running Docker
 * daemon. Every profile is enabled, so a service hidden behind a profile is
 * still checked.
 */
export async function loadComposeModel(file: string): Promise<ComposeModel> {
  const { stdout } = await run(
    'docker',
    ['compose', '--file', file, '--profile', '*', 'config', '--format', 'json'],
    { maxBuffer: MAX_OUTPUT_BYTES },
  );
  const raw: unknown = JSON.parse(stdout);
  return ComposeModel.parse(raw);
}
