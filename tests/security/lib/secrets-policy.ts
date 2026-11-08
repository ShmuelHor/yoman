import { basename } from 'node:path';

/** The one env file that may be committed (SECURITY A1), matched exactly. */
export const ENV_EXAMPLE = '.env.example';

/**
 * A value in `.env.example` counts as a placeholder when it is empty, or
 * `change-me` with an optional suffix of lowercase words joined by hyphens,
 * such as `change-me-run-npm-run-setup`. The suffix has no digits and at most
 * {@link MAX_PLACEHOLDER_SUFFIX} characters, so a hex or base64 secret can't
 * hide behind the prefix. Anything else could be a real secret, so it is
 * rejected. Non-secret defaults belong in code or in Compose, not here.
 */
const PLACEHOLDER_PREFIX = 'change-me';
const PLACEHOLDER = /^change-me(?:-[a-z]+)*$/u;
export const MAX_PLACEHOLDER_SUFFIX = 32;
const ENTRY = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/u;
const QUOTED = /^(['"])(.*)\1$/u;

/** A line of `.env.example` that is not an allowed placeholder entry. */
export interface EnvExampleViolation {
  /** 1-based line number. */
  readonly line: number;
  /** The variable name, or undefined when the line isn't a `KEY=value` entry. */
  readonly key: string | undefined;
  /** Why the line is rejected. Never includes the value, which may be a secret. */
  readonly reason: string;
}

function isEnvFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === '.env' || lower.startsWith('.env.') || lower.endsWith('.env');
}

/**
 * Tracked paths that are env files, anywhere in the tree and in any casing:
 * `.env`, `.env.<anything>` and `<anything>.env`. Only a file named exactly
 * `.env.example` is allowed.
 */
export function findTrackedEnvFiles(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => {
    const name = basename(path);
    return name !== ENV_EXAMPLE && isEnvFile(name);
  });
}

/** Tracked `.env.example` files, at any depth, whose values must all be placeholders. */
export function findEnvExamples(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => basename(path) === ENV_EXAMPLE);
}

function isPlaceholder(value: string): boolean {
  if (value === '') {
    return true;
  }
  return (
    PLACEHOLDER.test(value) && value.length - PLACEHOLDER_PREFIX.length <= MAX_PLACEHOLDER_SUFFIX
  );
}

function unquote(value: string): string {
  const match = QUOTED.exec(value);
  return match?.[2] ?? value;
}

function checkLine(text: string, line: number): EnvExampleViolation | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return undefined;
  }
  const entry = ENTRY.exec(trimmed);
  const key = entry?.[1];
  const value = entry?.[2];
  if (key === undefined || value === undefined) {
    return { line, key: undefined, reason: 'is not a KEY=value entry' };
  }
  return isPlaceholder(unquote(value.trim()))
    ? undefined
    : { line, key, reason: `${key} has a value that is not empty or change-me` };
}

/** Every line of `.env.example` that is not a comment, a blank line or a placeholder entry. */
export function findNonPlaceholderValues(content: string): readonly EnvExampleViolation[] {
  return content.split(/\r?\n/u).flatMap((text, index) => {
    const violation = checkLine(text, index + 1);
    return violation === undefined ? [] : [violation];
  });
}
