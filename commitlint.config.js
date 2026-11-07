/** Fits a one-line `git log --oneline` view and GitHub's PR commit list without truncation. */
const MAX_HEADER_LENGTH = 72;
const MAX_BODY_LINE_LENGTH = 100;

/** Conventional Commits, as described in CLAUDE.md. */
export default {
  extends: ['@commitlint/config-conventional'],
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
