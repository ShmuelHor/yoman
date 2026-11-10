import { describe, expect, it } from 'vitest';

import {
  exitCodeFor,
  formatReport,
  groupByOwner,
  type OpenSecurityTest,
  SECURITY_TEST_COUNT,
  type SecurityTodoScan,
  scanSecurityReport,
  type VitestJsonReport,
} from '../lib/security-todo.js';

const SUITE = '/repo/tests/security';

type FileResult = VitestJsonReport['testResults'][number];
type Assertion = FileResult['assertionResults'][number];

function assertion(
  title: string,
  status: Assertion['status'],
  meta: Assertion['meta'] = {},
): Assertion {
  return { title, fullName: `ST x ${title}`, status, meta };
}

function file(
  name: string,
  assertions: readonly Assertion[],
  status: FileResult['status'] = 'passed',
): FileResult {
  return { name: `${SUITE}/${name}`, status, message: '', assertionResults: [...assertions] };
}

/** A report of ST01 to ST18, each with one passing test, with the given files swapped in. */
function report(overrides: Readonly<Record<string, FileResult>> = {}): VitestJsonReport {
  const testResults = Array.from({ length: SECURITY_TEST_COUNT }, (_, index) => {
    const name = `st${String(index + 1).padStart(2, '0')}-check.test.ts`;
    return overrides[name] ?? file(name, [assertion('works', 'passed')]);
  });
  return { testResults };
}

describe('scanSecurityReport', () => {
  it('reports nothing for a complete suite of passing tests', () => {
    expect(scanSecurityReport(report(), SUITE)).toEqual({ open: [], inactive: [], errors: [] });
  });

  it('reads the owner and name of each todo', () => {
    const scan = scanSecurityReport(
      report({
        'st03-check.test.ts': file('st03-check.test.ts', [
          assertion('[T19] returns 401 without a token', 'todo'),
          assertion("[T02] it's 0600", 'todo'),
        ]),
      }),
      SUITE,
    );

    expect(scan.open).toEqual([
      { id: 'ST03', owner: 'T19', name: 'returns 401 without a token' },
      { id: 'ST03', owner: 'T02', name: "it's 0600" },
    ]);
    expect(scan.errors).toEqual([]);
  });

  it('rejects a todo without an owner', () => {
    const scan = scanSecurityReport(
      report({
        'st04-check.test.ts': file('st04-check.test.ts', [assertion('returns 421', 'todo')]),
      }),
      SUITE,
    );

    expect(scan.errors).toEqual([
      'st04-check.test.ts has a todo without a [Txx] owner: returns 421',
    ]);
  });

  it.each([
    ['skipped', 'skipped'],
    ['pending', 'skipped'],
    ['disabled', 'skipped'],
    ['failed', 'failed'],
  ] as const)('reports a %s test as %s', (status, reason) => {
    const scan = scanSecurityReport(
      report({
        'st05-check.test.ts': file('st05-check.test.ts', [assertion('x', status)], 'failed'),
      }),
      SUITE,
    );

    expect(scan.inactive).toEqual([{ id: 'ST05', name: 'ST x x', reason }]);
  });

  it('reports a passing test declared with .fails', () => {
    const scan = scanSecurityReport(
      report({
        'st06-check.test.ts': file('st06-check.test.ts', [
          assertion('x', 'passed', { failsByDesign: true }),
        ]),
      }),
      SUITE,
    );

    expect(scan.inactive).toEqual([{ id: 'ST06', name: 'ST x x', reason: 'fails-by-design' }]);
  });

  it('reports a file that failed without a failing test, such as an import error', () => {
    const broken = { ...file('st07-check.test.ts', [], 'failed'), message: 'Cannot find module' };

    const scan = scanSecurityReport(report({ 'st07-check.test.ts': broken }), SUITE);

    expect(scan.errors).toEqual(['st07-check.test.ts failed to run: Cannot find module']);
  });

  it('reports each ST test that has no file', () => {
    const partial = {
      testResults: report().testResults.filter(({ name }) => !name.includes('st07')),
    };

    expect(scanSecurityReport(partial, SUITE).errors).toEqual(['ST07 has no test file']);
  });

  it('reports an ST test with two files', () => {
    const doubled = report();
    const scan = scanSecurityReport(
      { testResults: [...doubled.testResults, file('st08-other.test.ts', [])] },
      SUITE,
    );

    expect(scan.errors).toEqual(['ST08 has more than one file']);
  });

  it.each([
    'st20-extra.test.ts',
    'st00-zero.test.ts',
    'auth.test.ts',
    'st1-short.test.ts',
    'st03_Auth.test.ts',
    'lib/st03-nested.test.ts',
  ])('rejects the file %s', (name) => {
    const scan = scanSecurityReport(
      { testResults: [...report().testResults, file(name, [])] },
      SUITE,
    );

    expect(scan.errors).toEqual([
      `${name} is not named st01- to st18-<slug>.test.ts directly in the suite`,
    ]);
  });
});

const OPEN: readonly OpenSecurityTest[] = [
  { id: 'ST11', owner: 'T12', name: 'agent logs' },
  { id: 'ST04', owner: 'T19', name: 'host' },
  { id: 'ST03', owner: 'T19', name: 'auth' },
  { id: 'ST11', owner: 'T09', name: 'service logs' },
];

const CLEAN: SecurityTodoScan = { open: [], inactive: [], errors: [] };

describe('exitCodeFor', () => {
  it.each([
    ['a clean suite', CLEAN, false, 0],
    ['a clean suite', CLEAN, true, 0],
    ['open todos', { ...CLEAN, open: OPEN }, false, 0],
    ['open todos', { ...CLEAN, open: OPEN }, true, 1],
    [
      'a skipped test',
      { ...CLEAN, inactive: [{ id: 'ST01', name: 'x', reason: 'skipped' }] },
      false,
      0,
    ],
    [
      'a skipped test',
      { ...CLEAN, inactive: [{ id: 'ST01', name: 'x', reason: 'skipped' }] },
      true,
      1,
    ],
    [
      'a .fails test',
      { ...CLEAN, inactive: [{ id: 'ST01', name: 'x', reason: 'fails-by-design' }] },
      true,
      1,
    ],
    [
      'a failing test',
      { ...CLEAN, inactive: [{ id: 'ST01', name: 'x', reason: 'failed' }] },
      false,
      1,
    ],
    ['an error', { ...CLEAN, errors: ['ST07 has no test file'] }, false, 1],
  ] as const)('with %s and strict=%s exits %i', (_name, scan, strict, code) => {
    expect(exitCodeFor(scan, strict)).toBe(code);
  });
});

describe('groupByOwner', () => {
  it('groups by task in numeric order, tests in ID order', () => {
    const groups = groupByOwner(OPEN);

    expect([...groups.keys()]).toEqual(['T09', 'T12', 'T19']);
    expect(groups.get('T19')?.map(({ id }) => id)).toEqual(['ST03', 'ST04']);
  });
});

describe('formatReport', () => {
  it('lists open tests under their owning task', () => {
    expect(formatReport({ ...CLEAN, open: OPEN })).toBe(
      [
        '4 security test(s) still todo:',
        '',
        'T09 (1)',
        '  ST11  service logs',
        '',
        'T12 (1)',
        '  ST11  agent logs',
        '',
        'T19 (2)',
        '  ST03  auth',
        '  ST04  host',
        '',
      ].join('\n'),
    );
  });

  it('lists tests that are not proving anything', () => {
    const scan = {
      ...CLEAN,
      inactive: [{ id: 'ST01', name: 'repo check', reason: 'skipped' as const }],
    };

    expect(formatReport(scan)).toBe(
      'No security test is still todo.\n\n1 security test(s) not proving anything:\n  ST01  skipped  repo check\n',
    );
  });

  it('says so when nothing is open', () => {
    expect(formatReport(CLEAN)).toBe('No security test is still todo.\n');
  });
});
