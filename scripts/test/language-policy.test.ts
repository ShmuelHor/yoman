import { describe, expect, it } from 'vitest';

import { findHebrew, formatViolation, isBinary, shouldScan } from '../lib/language-policy.js';

// Hebrew samples are written as escapes so this file passes its own check.
const SHALOM = '\u05e9\u05dc\u05d5\u05dd';
const EXCERPT_LIMIT = 80;
const LONG_LINE_TAIL = 200;
const BINARY_SNIFF_WINDOW = 8000;
const ASCII_X = 0x78;

describe('shouldScan', () => {
  it.each([
    'apps/web/src/app.tsx',
    'README.md',
    'docker-compose.yml',
    'Dockerfile',
    'docs/SPEC.md',
    'CLAUDE.md',
  ])('scans %s', (path) => {
    expect(shouldScan(path)).toBe(true);
  });

  it.each([
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

describe('isBinary', () => {
  it('treats text without NUL bytes as text', () => {
    expect(isBinary(new TextEncoder().encode(`const a = "${SHALOM}";`))).toBe(false);
  });

  it('treats content with a NUL byte as binary, even if it would decode to Hebrew', () => {
    expect(isBinary(new TextEncoder().encode(`PNG\0${SHALOM}`))).toBe(true);
  });

  it('only looks at the first 8000 bytes', () => {
    const content = new Uint8Array(BINARY_SNIFF_WINDOW + 1).fill(ASCII_X);
    content[BINARY_SNIFF_WINDOW] = 0;

    expect(isBinary(content)).toBe(false);
  });

  it('treats empty content as text', () => {
    expect(isBinary(new Uint8Array())).toBe(false);
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
    const [violation] = findHebrew('a.ts', `${SHALOM} ${'x'.repeat(LONG_LINE_TAIL)}`);

    expect(violation?.excerpt).toHaveLength(EXCERPT_LIMIT);
  });
});

describe('formatViolation', () => {
  it('formats as file:line followed by the excerpt', () => {
    expect(formatViolation({ file: 'a.ts', line: 3, excerpt: 'x' })).toBe('a.ts:3  x');
  });
});
