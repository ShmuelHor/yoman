import { createSessionsService } from './service.js';

const EXIT_FAILURE = 1;

// `start` has already logged the cause and released everything; only the exit code is left.
await createSessionsService()
  .start()
  .catch(() => {
    process.exitCode = EXIT_FAILURE;
  });
