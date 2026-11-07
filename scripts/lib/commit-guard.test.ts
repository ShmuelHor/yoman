import { describe, expect, it } from 'vitest';

import { findForbiddenEnvFiles, gitleaksArgs, isForbiddenEnvFile } from './commit-guard.js';

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
  ])('blocks %s', (path) => {
    expect(isForbiddenEnvFile(path)).toBe(true);
  });

  it.each([
    '.env.example',
    'services/gateway/.env.example',
    '.envrc',
    'env.ts',
    'docs/.environment.md',
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

describe('gitleaksArgs', () => {
  const current = ['git', '--pre-commit', '--staged', '--redact', '--verbose', '--no-banner'];
  const legacy = ['protect', '--staged', '--redact', '--verbose', '--no-banner'];

  it.each(['8.19.0', 'v8.28.0', '9.0.0', '8.19.2\n'])('uses `git --staged` on %s', (version) => {
    expect(gitleaksArgs(version)).toEqual(current);
  });

  it.each(['8.16.0', 'v8.18.4', '7.6.1'])('uses `protect --staged` on %s', (version) => {
    expect(gitleaksArgs(version)).toEqual(legacy);
  });

  it('falls back to the current syntax for an unrecognized version', () => {
    expect(gitleaksArgs('dev')).toEqual(current);
  });
});
