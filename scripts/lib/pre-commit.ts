import type { ChildExit } from './child-exit.js';
import { toExitOutcome } from './child-exit.js';
import { findForbiddenEnvFiles, gitleaksArgs } from './commit-guard.js';

const EXIT_SUCCESS = 0;
const EXIT_BLOCKED = 1;

/** The IO the pre-commit hook needs, passed in so the hook is testable. */
export interface PreCommitDeps {
  /** Repo-relative paths of the staged files that are added, copied, modified or renamed. */
  readonly listStagedFiles: () => Promise<readonly string[]>;
  /** The output of `gitleaks version`, or `undefined` when gitleaks is not on `PATH`. */
  readonly gitleaksVersion: () => Promise<string | undefined>;
  /** Runs gitleaks with the given arguments, its output going straight to the terminal. */
  readonly runGitleaks: (args: readonly string[]) => Promise<ChildExit>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export const GITLEAKS_MISSING_WARNING = `Warning: gitleaks is not installed, so staged changes were not scanned for secrets.
CI still runs gitleaks on every push and pull request and will fail on a leak.
Install it from the official releases (https://github.com/gitleaks/gitleaks/releases),
with your package manager (for example \`brew install gitleaks\`), or with
\`go install github.com/zricethezav/gitleaks/v8@latest\`.
`;

/**
 * The pre-commit hook: blocks staged env files, then scans staged changes with gitleaks.
 *
 * The env file check never depends on gitleaks, so it always runs. A missing
 * gitleaks only warns, because CI is the enforcing gate; a gitleaks that runs
 * and fails, for a leak or any other reason, blocks the commit.
 *
 * @returns the hook's exit code: 0 to allow the commit, non-zero to block it
 */
export async function runPreCommit(deps: PreCommitDeps): Promise<number> {
  const forbidden = findForbiddenEnvFiles(await deps.listStagedFiles());
  if (forbidden.length > 0) {
    const lines = [
      'Commit blocked: env files hold secrets and must never be committed.',
      ...forbidden.map((path) => `  ${path}`),
      'Unstage them with `git restore --staged <file>`. Only .env.example belongs in git.',
    ];
    deps.stderr(`${lines.join('\n')}\n`);
    return EXIT_BLOCKED;
  }

  const version = await deps.gitleaksVersion();
  if (version === undefined) {
    deps.stderr(GITLEAKS_MISSING_WARNING);
    return EXIT_SUCCESS;
  }

  const outcome = toExitOutcome('gitleaks', await deps.runGitleaks(gitleaksArgs(version)));
  if (outcome.message !== undefined) {
    deps.stderr(`${outcome.message}\n`);
  }
  if (outcome.exitCode !== EXIT_SUCCESS) {
    deps.stderr('Commit blocked: gitleaks did not pass on the staged changes.\n');
    return outcome.exitCode;
  }
  deps.stdout('gitleaks: no secrets in the staged changes.\n');
  return EXIT_SUCCESS;
}
