/** Fits a one-line `git log --oneline` view and GitHub's PR commit list without truncation. */
const MAX_HEADER_LENGTH = 72;
const MAX_BODY_LINE_LENGTH = 100;

/**
 * Dependabot always capitalizes "Bump" and has no option to lowercase it, and it
 * shortens long subjects unpredictably, so its commits are recognized by the
 * subject prefix plus its sign-off trailer rather than by the full subject.
 */
const DEPENDABOT_SUBJECT = /^(build|ci)\(deps\): Bump \S/;
const DEPENDABOT_SIGN_OFF = /^Signed-off-by: dependabot\[bot\] <support@github\.com>$/m;

const isDependabotCommit = (message) =>
  DEPENDABOT_SUBJECT.test(message) && DEPENDABOT_SIGN_OFF.test(message);

/** Conventional Commits, as described in CLAUDE.md. */
export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [isDependabotCommit],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'test',
        'refactor',
        'perf',
        'docs',
        'chore',
        'ci',
        'build',
        'security',
        'revert',
      ],
    ],
    'header-max-length': [2, 'always', MAX_HEADER_LENGTH],
    'body-max-line-length': [2, 'always', MAX_BODY_LINE_LENGTH],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
  },
};
