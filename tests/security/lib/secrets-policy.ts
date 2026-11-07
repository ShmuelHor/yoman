import { basename } from 'node:path';

/** The one env file that may be committed (SECURITY A1). */
const ENV_EXAMPLE = '.env.example';
const ENV_FILE = /^\.env(\..+)?$/u;

/**
 * A value in `.env.example` counts as a placeholder when it is empty or
 * `change-me`, optionally with a suffix: `change-me`, `change-me-db-password`.
 * Anything else could be a real secret, so it is rejected. Non-secret defaults
 * belong in code or in Compose, not in `.env.example`.
 */
const PLACEHOLDER = /^(change-me(-[a-z0-9]+)*)?$/u;
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

/** Tracked paths that are env files other than `.env.example`, anywhere in the tree. */
export function findTrackedEnvFiles(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => {
    const name = basename(path);
    return name !== ENV_EXAMPLE && ENV_FILE.test(name);
  });
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
  return PLACEHOLDER.test(unquote(value.trim()))
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
