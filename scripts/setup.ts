/**
 * Creates `.env` with random secrets, or adds the ones it is missing.
 * Safe to re-run: existing values are never changed. Prints key names only.
 *
 * Usage: npm run setup
 */
import { fileURLToPath } from 'node:url';

import { ensureEnvFile, UnsafeEnvFileError } from './lib/env-file.js';
import { InvalidEnvFileError } from './lib/env-secrets.js';

const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
const EXIT_FAILURE = 1;

try {
  const { created, added, fixedMode } = await ensureEnvFile(ENV_PATH);
  if (created) {
    process.stdout.write(`Created .env (mode 0600) with ${String(added.length)} secrets.\n`);
  } else if (added.length > 0) {
    process.stdout.write(`Added to .env: ${added.join(', ')}. Existing values were kept.\n`);
  } else {
    process.stdout.write('.env already has every secret. Nothing changed.\n');
  }
  if (fixedMode) {
    process.stdout.write('Tightened .env permissions to 0600.\n');
  }
} catch (error: unknown) {
  if (error instanceof InvalidEnvFileError) {
    process.stderr.write(
      `${error.message}\nFix or delete these lines and run \`npm run setup\` again. Nothing was changed.\n`,
    );
  } else if (error instanceof UnsafeEnvFileError) {
    process.stderr.write(`Refusing to touch .env: ${error.message}\n`);
  } else {
    throw error;
  }
  process.exitCode = EXIT_FAILURE;
}
