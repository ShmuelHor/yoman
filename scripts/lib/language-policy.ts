import { extname } from 'node:path';

/** Hebrew block plus Hebrew presentation forms. */
const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/u;

/**
 * Paths where Hebrew is expected: translation files and planning docs.
 * Everything else (code, comments, config, README) must be English.
 */
const ALLOWED_PATHS: readonly RegExp[] = [
  /^docs\//u,
  /^CLAUDE\.md$/u,
  /(^|\/)i18n\/he(\/|\.json$)/u,
];

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.pdf',
  '.zip',
  '.gz',
]);

const MAX_EXCERPT_LENGTH = 80;

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
}

/** Whether a repo-relative path should be scanned at all. */
export function shouldScan(path: string): boolean {
  if (ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return false;
  }
  return !BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Returns one violation per line of `content` that contains Hebrew. */
export function findHebrew(file: string, content: string): Violation[] {
  return content
    .split('\n')
    .flatMap((text, index) =>
      HEBREW.test(text)
        ? [{ file, line: index + 1, excerpt: text.trim().slice(0, MAX_EXCERPT_LENGTH) }]
        : [],
    );
}

export function formatViolation({ file, line, excerpt }: Violation): string {
  return `${file}:${String(line)}  ${excerpt}`;
}
