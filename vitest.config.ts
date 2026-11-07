import { defineConfig } from 'vitest/config';

const STRICT = { lines: 80, functions: 80, branches: 80, statements: 80 };
const BASELINE = { lines: 60, functions: 60, branches: 60, statements: 60 };

export default defineConfig({
  test: {
    include: ['{scripts,packages,services,apps}/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['scripts/lib/**/*.{ts,tsx}', '{packages,services,apps}/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      thresholds: {
        ...BASELINE,
        // Pure logic carries the product's behavior, so it is held to a higher bar.
        'services/*/src/domain/**': STRICT,
        'apps/agent/src/core/**': STRICT,
        'scripts/lib/**': STRICT,
      },
    },
  },
});
