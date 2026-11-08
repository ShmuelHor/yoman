import { defineConfig } from 'vitest/config';

/**
 * The security suite (SECURITY.md section 3) runs on its own: it checks the
 * repo and its Compose files rather than a package, so it has no coverage
 * thresholds and stays out of `npm test`.
 */
export default defineConfig({
  test: {
    include: ['tests/security/**/*.test.ts'],
    setupFiles: ['tests/security/lib/record-modifiers.ts'],
    // A focused test silently skips the rest of its file, so `.only` fails the run everywhere.
    allowOnly: false,
    restoreMocks: true,
  },
});
