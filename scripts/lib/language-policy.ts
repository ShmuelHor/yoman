import { extname } from 'node:path';

/** Hebrew block plus Hebrew presentation forms. */
const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/u;

/**
 * Paths where Hebrew is expected: UI translation files only.
 * Everything else (code, comments, config, docs, README) must be English.
 */
const ALLOWED_PATHS: readonly RegExp[] = [/(^|\/)i18n\/he(\/|\.json$)/u];

/**
 * Extensions skipped without reading the file. This is only a fast path:
 * any other binary file is still caught by {@link isBinary}.
 */
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
  '.otf',
  '.avif',
  '.mp3',
  '.webm',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
]);

/** How much of a file to sniff for a NUL byte; the same window git uses to detect binaries. */
const BINARY_SNIFF_LENGTH = 8000;
const NUL = 0;

const MAX_EXCERPT_LENGTH = 80;

/** A line that contains Hebrew where only English is allowed. */
export interface Violation {
  /** Repo-relative path of the file. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** The trimmed line, cut to a readable length. */
  readonly excerpt: string;
}

/** Whether a repo-relative path should be scanned at all. */
export function shouldScan(path: string): boolean {
  if (ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return false;
  }
  return !BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Whether file content is binary, judged by a NUL byte near the start (as git
 * does). Decoding a binary as UTF-8 can produce Hebrew code points by chance,
 * so binaries must be skipped rather than scanned.
 */
export function isBinary(content: Uint8Array): boolean {
  return content.subarray(0, BINARY_SNIFF_LENGTH).includes(NUL);
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

/** Formats a violation as `file:line  excerpt`, the shape editors and terminals link to. */
export function formatViolation({ file, line, excerpt }: Violation): string {
  return `${file}:${String(line)}  ${excerpt}`;
}
