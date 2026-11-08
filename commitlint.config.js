/** Fits a one-line `git log --oneline` view and GitHub's PR commit list without truncation. */
const MAX_HEADER_LENGTH = 72;
const MAX_BODY_LINE_LENGTH = 100;

/**
 * Dependabot always writes "Bump <package> from <a> to <b>" and has no option to
 * lowercase it, so only that exact generated shape skips linting.
 */
const DEPENDABOT_SUBJECT = /^(build|ci)\(deps\): Bump \S+ from \S+ to \S+/;

/** Conventional Commits, as described in CLAUDE.md. */
export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => DEPENDABOT_SUBJECT.test(message)],
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
