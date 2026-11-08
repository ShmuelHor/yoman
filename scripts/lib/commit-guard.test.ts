import { describe, expect, it } from 'vitest';

import {
  detectGitleaksSyntax,
  findForbiddenEnvFiles,
  gitleaksArgs,
  isForbiddenEnvFile,
} from './commit-guard.js';

describe('isForbiddenEnvFile', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    '.env.example.bak',
    '.env.abc123.tmp',
    'services/gateway/.env',
    'apps/agent/.env.test',
    '.ENV',
    '.env~',
    '.envrc',
    '.env-prod',
    '.env_local',
    '.env.bak',
    'docs/.environment.md',
    '.ENV.EXAMPLE',
    '.Env.example',
    '.env/prod',
    'config/.env.d/db.conf',
    '.env.example/secret',
  ])('blocks %s', (path) => {
    expect(isForbiddenEnvFile(path)).toBe(true);
  });

  it.each([
    '.env.example',
    'services/gateway/.env.example',
    'env.ts',
    'apps/web/src/.prettierrc.env',
    'scripts/setup.ts',
  ])('allows %s', (path) => {
    expect(isForbiddenEnvFile(path)).toBe(false);
  });
});

describe('findForbiddenEnvFiles', () => {
  it('returns only the env files, in staged order', () => {
    expect(
      findForbiddenEnvFiles(['README.md', 'apps/x/.env', '.env.example', '.env.local']),
    ).toEqual(['apps/x/.env', '.env.local']);
  });

  it('returns nothing for a clean commit', () => {
    expect(findForbiddenEnvFiles(['README.md', '.env.example'])).toEqual([]);
  });
});

describe('detectGitleaksSyntax', () => {
  it('uses `git` when `gitleaks git --help` succeeds and lists --staged', () => {
    expect(
      detectGitleaksSyntax({ succeeded: true, output: '  --staged   scan staged commits' }),
    ).toBe('git');
  });

  it('uses `protect` when there is no `git` command', () => {
    expect(detectGitleaksSyntax({ succeeded: false, output: 'Error: unknown command "git"' })).toBe(
      'protect',
    );
  });

  it('uses `protect` when the help does not mention --staged', () => {
    expect(detectGitleaksSyntax({ succeeded: true, output: 'Usage: gitleaks [command]' })).toBe(
      'protect',
    );
  });
});

describe('gitleaksArgs', () => {
  it('scans staged changes with the `git` command', () => {
    expect(gitleaksArgs('git')).toEqual([
      'git',
      '--pre-commit',
      '--staged',
      '--redact',
      '--verbose',
      '--no-banner',
    ]);
  });

  it('scans staged changes with the legacy `protect` command', () => {
    expect(gitleaksArgs('protect')).toEqual([
      'protect',
      '--staged',
      '--redact',
      '--verbose',
      '--no-banner',
    ]);
  });
});
