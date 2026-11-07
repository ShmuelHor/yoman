import { describe, expect, it } from 'vitest';

import { toExitOutcome } from './child-exit.js';

describe('toExitOutcome', () => {
  it('succeeds when the child exits with 0', () => {
    expect(toExitOutcome('npm', { code: 0, signal: null })).toEqual({ exitCode: 0 });
  });

  it('passes a non-zero exit code through without a message', () => {
    expect(toExitOutcome('npm', { code: 3, signal: null })).toEqual({ exitCode: 3 });
  });

  it('fails with a message when the child is killed by a signal', () => {
    expect(toExitOutcome('npm', { code: null, signal: 'SIGKILL' })).toEqual({
      exitCode: 1,
      message: 'npm was terminated by SIGKILL.',
    });
  });

  it('fails with a message when the child reports neither code nor signal', () => {
    expect(toExitOutcome('npm', { code: null, signal: null })).toEqual({
      exitCode: 1,
      message: 'npm exited without an exit code.',
    });
  });
});
