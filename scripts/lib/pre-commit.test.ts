import { describe, expect, it, vi } from 'vitest';

import type { ChildExit } from './child-exit.js';
import { GITLEAKS_MISSING_WARNING, type PreCommitDeps, runPreCommit } from './pre-commit.js';

const LEAK_FOUND = 1;
const CUSTOM_EXIT = 3;

interface Harness {
  readonly deps: PreCommitDeps;
  readonly runGitleaks: ReturnType<typeof vi.fn<(args: readonly string[]) => Promise<ChildExit>>>;
  readonly stdout: string[];
  readonly stderr: string[];
}

function harness(options: {
  readonly staged: readonly string[];
  readonly version?: string;
  readonly exit?: ChildExit;
}): Harness {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const runGitleaks = vi.fn((_args: readonly string[]) =>
    Promise.resolve(options.exit ?? { code: 0, signal: null }),
  );
  return {
    deps: {
      listStagedFiles: () => Promise.resolve(options.staged),
      gitleaksVersion: () => Promise.resolve(options.version),
      runGitleaks,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    runGitleaks,
    stdout,
    stderr,
  };
}

describe('runPreCommit', () => {
  it('blocks a staged .env without running gitleaks', async () => {
    const h = harness({ staged: ['README.md', '.env'], version: '8.28.0' });

    const code = await runPreCommit(h.deps);

    expect(code).toBe(LEAK_FOUND);
    expect(h.stderr.join('')).toContain('Commit blocked: env files');
    expect(h.stderr.join('')).toContain('  .env\n');
    expect(h.runGitleaks).not.toHaveBeenCalled();
  });

  it('blocks a staged .env even when gitleaks is not installed', async () => {
    const h = harness({ staged: ['services/gateway/.env.local'] });

    await expect(runPreCommit(h.deps)).resolves.toBe(LEAK_FOUND);
    expect(h.stderr.join('')).not.toContain(GITLEAKS_MISSING_WARNING);
  });

  it('warns and allows the commit when gitleaks is not installed', async () => {
    const h = harness({ staged: ['.env.example', 'README.md'] });

    await expect(runPreCommit(h.deps)).resolves.toBe(0);
    expect(h.stderr).toEqual([GITLEAKS_MISSING_WARNING]);
  });

  it('runs gitleaks on the staged changes and allows a clean commit', async () => {
    const h = harness({ staged: ['README.md'], version: '8.28.0' });

    await expect(runPreCommit(h.deps)).resolves.toBe(0);
    expect(h.runGitleaks).toHaveBeenCalledWith([
      'git',
      '--pre-commit',
      '--staged',
      '--redact',
      '--verbose',
      '--no-banner',
    ]);
    expect(h.stdout).toEqual(['gitleaks: no secrets in the staged changes.\n']);
  });

  it('blocks the commit when gitleaks finds a leak', async () => {
    const h = harness({
      staged: ['src/config.ts'],
      version: '8.16.0',
      exit: { code: CUSTOM_EXIT, signal: null },
    });

    await expect(runPreCommit(h.deps)).resolves.toBe(CUSTOM_EXIT);
    expect(h.runGitleaks.mock.calls[0]?.[0]?.[0]).toBe('protect');
    expect(h.stderr.join('')).toContain('gitleaks did not pass');
  });

  it('blocks the commit when gitleaks is killed by a signal', async () => {
    const h = harness({
      staged: ['src/config.ts'],
      version: '8.28.0',
      exit: { code: null, signal: 'SIGTERM' },
    });

    await expect(runPreCommit(h.deps)).resolves.toBe(LEAK_FOUND);
    expect(h.stderr.join('')).toContain('gitleaks was terminated by SIGTERM.');
  });
});
