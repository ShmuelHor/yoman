import { posix } from 'node:path';

const ENV_PREFIX = '.env';
const ENV_EXAMPLE = '.env.example';

/**
 * Whether a staged path is an env file that must never be committed: any basename
 * starting with `.env`, in any directory, except exactly `.env.example`. The match
 * is deliberately broad, so editor backups (`.env~`), copies (`.env.bak`, `.env-prod`)
 * and tool files (`.envrc`) are caught too. It is case-insensitive, so `.ENV`
 * cannot slip through on any file system.
 */
export function isForbiddenEnvFile(path: string): boolean {
  const name = posix.basename(path);
  return name.toLowerCase().startsWith(ENV_PREFIX) && name !== ENV_EXAMPLE;
}

/** The staged paths that {@link isForbiddenEnvFile} rejects, in their original order. */
export function findForbiddenEnvFiles(paths: readonly string[]): string[] {
  return paths.filter(isForbiddenEnvFile);
}

/**
 * Which gitleaks command scans staged changes: `git --staged` since v8.19.0, or
 * the older `protect --staged` (for example the 8.16 in Ubuntu's archive).
 */
export type GitleaksSyntax = 'git' | 'protect';

/** What running `gitleaks git --help` showed. */
export interface GitleaksHelpProbe {
  readonly succeeded: boolean;
  readonly output: string;
}

const STAGED_FLAG = '--staged';
const SHARED_FLAGS = [STAGED_FLAG, '--redact', '--verbose', '--no-banner'] as const;

/**
 * Detects the syntax from `gitleaks git --help` instead of the version string,
 * which some builds do not set. Releases before v8.19.0 have no `git` command,
 * so the probe fails there. The `git` syntax is chosen only when its help also
 * lists `--staged`, so a build that has neither still gets `protect`, and if
 * that is wrong too gitleaks fails and the commit is blocked.
 */
export function detectGitleaksSyntax(probe: GitleaksHelpProbe): GitleaksSyntax {
  return probe.succeeded && probe.output.includes(STAGED_FLAG) ? 'git' : 'protect';
}

/** The gitleaks arguments that scan only the staged changes. */
export function gitleaksArgs(syntax: GitleaksSyntax): readonly string[] {
  return syntax === 'git' ? ['git', '--pre-commit', ...SHARED_FLAGS] : ['protect', ...SHARED_FLAGS];
}
