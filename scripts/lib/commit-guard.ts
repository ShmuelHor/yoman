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

/** gitleaks v8.19.0 replaced `protect --staged` with `git --staged`. */
const GIT_COMMAND_SINCE = { major: 8, minor: 19 } as const;
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.\d+/u;

const SHARED_FLAGS = ['--staged', '--redact', '--verbose', '--no-banner'] as const;

/**
 * The gitleaks arguments that scan only the staged changes, for the installed version.
 * Older releases (such as the 8.16 in Ubuntu's archive) only know `protect`. An
 * unrecognized version gets the current syntax: if it is wrong, gitleaks fails and
 * the commit is blocked, never silently allowed.
 *
 * @param versionOutput the trimmed output of `gitleaks version`
 */
export function gitleaksArgs(versionOutput: string): readonly string[] {
  const match = VERSION_PATTERN.exec(versionOutput.trim());
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  const isLegacy =
    match !== null &&
    (major < GIT_COMMAND_SINCE.major ||
      (major === GIT_COMMAND_SINCE.major && minor < GIT_COMMAND_SINCE.minor));
  return isLegacy ? ['protect', ...SHARED_FLAGS] : ['git', '--pre-commit', ...SHARED_FLAGS];
}
