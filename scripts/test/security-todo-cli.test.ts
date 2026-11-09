import { describe, expect, it } from 'vitest';
import { SECURITY_TEST_COUNT, type VitestJsonReport } from '../lib/security-todo.js';
import { isStrict, runSecurityTodo, type SecurityTodoIo } from '../lib/security-todo-cli.js';

const SUITE = '/repo/tests/security';

type Status = VitestJsonReport['testResults'][number]['assertionResults'][number]['status'];

/** A report of ST01 to ST19 where ST03 has one test with the given status. */
function reportWith(status: Status, title = '[T19] returns 401'): VitestJsonReport {
  return {
    testResults: Array.from({ length: SECURITY_TEST_COUNT }, (_, index) => {
      const id = String(index + 1).padStart(2, '0');
      const testStatus = id === '03' ? status : 'passed';
      return {
        name: `${SUITE}/st${id}-check.test.ts`,
        status: testStatus === 'failed' ? 'failed' : 'passed',
        message: '',
        assertionResults: [{ title, fullName: `ST${id} ${title}`, status: testStatus, meta: {} }],
      };
    }),
  };
}

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function run(
  report: unknown,
  argv: readonly string[] = [],
  env: SecurityTodoIo['env'] = {},
): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exitCode = await runSecurityTodo({
    argv,
    env,
    suiteDir: SUITE,
    runSuite: () => Promise.resolve(report),
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

describe('isStrict', () => {
  it.each([
    [['--strict'], {}, true],
    [[], { npm_config_strict: 'true' }, true],
    [[], { npm_config_strict: '' }, false],
    [[], {}, false],
    [['--other'], {}, false],
  ] as const)('argv %j with env %j is strict=%s', (argv, env, strict) => {
    expect(isStrict(argv, env)).toBe(strict);
  });
});

describe('runSecurityTodo', () => {
  it('lists an open todo and exits 0 without --strict', async () => {
    const result = await run(reportWith('todo'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('T19 (1)\n  ST03  returns 401');
  });

  it('exits 1 on an open todo with --strict', async () => {
    const result = await run(reportWith('todo'), ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--strict');
  });

  it('exits 1 on an open todo when npm passes --strict as npm_config_strict', async () => {
    expect((await run(reportWith('todo'), [], { npm_config_strict: 'true' })).exitCode).toBe(1);
  });

  it('exits 0 with --strict when every test passes', async () => {
    expect((await run(reportWith('passed'), ['--strict'])).exitCode).toBe(0);
  });

  it('exits 1 on a skipped test only with --strict', async () => {
    expect((await run(reportWith('skipped'))).exitCode).toBe(0);
    expect((await run(reportWith('skipped'), ['--strict'])).exitCode).toBe(1);
  });

  it('exits 1 on a failing test even without --strict', async () => {
    expect((await run(reportWith('failed'))).exitCode).toBe(1);
  });

  it('exits 1 on an unowned todo even without --strict', async () => {
    const result = await run(reportWith('todo', 'returns 401'));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('without a [Txx] owner');
  });

  it('exits 1 when the report has an unexpected shape', async () => {
    const result = await run({ testResults: 'nope' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('unexpected shape');
  });
});
