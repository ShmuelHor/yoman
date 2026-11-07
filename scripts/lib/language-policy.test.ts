import { describe, expect, it } from 'vitest';

import { findHebrew, formatViolation, shouldScan } from './language-policy.js';

// Hebrew samples are written as escapes so this file passes its own check.
const SHALOM = '\u05e9\u05dc\u05d5\u05dd';

describe('shouldScan', () => {
  it.each(['apps/web/src/app.tsx', 'README.md', 'docker-compose.yml', 'Dockerfile'])(
    'scans %s',
    (path) => {
      expect(shouldScan(path)).toBe(true);
    },
  );

  it.each([
    'docs/SPEC.md',
    'CLAUDE.md',
    'apps/web/src/i18n/he/today.json',
    'apps/agent/src/i18n/he.json',
    'apps/web/public/logo.png',
  ])('skips %s', (path) => {
    expect(shouldScan(path)).toBe(false);
  });

  it('still scans English translation files', () => {
    expect(shouldScan('apps/web/src/i18n/en/today.json')).toBe(true);
  });
});

describe('findHebrew', () => {
  it('returns nothing for English-only content', () => {
    expect(findHebrew('a.ts', 'const greeting = "hello";\n// a comment')).toEqual([]);
  });

  it('reports each offending line with its 1-based number', () => {
    const content = `const a = 1;\n// ${SHALOM}\nconst b = "${SHALOM}";`;

    expect(findHebrew('a.ts', content)).toEqual([
      { file: 'a.ts', line: 2, excerpt: `// ${SHALOM}` },
      { file: 'a.ts', line: 3, excerpt: `const b = "${SHALOM}";` },
    ]);
  });

  it('truncates long excerpts', () => {
    const [violation] = findHebrew('a.ts', `${SHALOM} ${'x'.repeat(200)}`);

    expect(violation?.excerpt).toHaveLength(80);
  });
});

describe('formatViolation', () => {
  it('formats as file:line followed by the excerpt', () => {
    expect(formatViolation({ file: 'a.ts', line: 3, excerpt: 'x' })).toBe('a.ts:3  x');
  });
});
