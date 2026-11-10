import { createBatteryService } from './service.js';

const EXIT_FAILURE = 1;

// `start` has already logged the cause and released everything; only the exit code is left.
await createBatteryService()
  .start()
  .catch(() => {
    process.exitCode = EXIT_FAILURE;
  });
