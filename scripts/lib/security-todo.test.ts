import { describe, expect, it } from 'vitest';

import {
  formatReport,
  groupByOwner,
  type OpenSecurityTest,
  SECURITY_TEST_COUNT,
  type SecurityTestSource,
  scanSecurityTests,
} from './security-todo.js';

const ACTIVE = "describe('ST00 x', () => { it('works', () => {}); });";

/** A full set of ST01 to ST19 files, all active, with the given files swapped in. */
function suite(overrides: Readonly<Record<string, string>> = {}): SecurityTestSource[] {
  return Array.from({ length: SECURITY_TEST_COUNT }, (_, index) => {
    const fileName = `st${String(index + 1).padStart(2, '0')}-check.test.ts`;
    return { fileName, source: overrides[fileName] ?? ACTIVE };
  });
}

describe('scanSecurityTests', () => {
  it('reports nothing for a complete suite of active tests', () => {
    expect(scanSecurityTests(suite())).toEqual({ open: [], errors: [] });
  });

  it('reads the owner and name of each todo', () => {
    const files = suite({
      'st03-check.test.ts':
        "it.todo('[T19] returns 401 without a token');\nit.todo(\"[T02] it's 0600\");",
      'st12-check.test.ts': "it.todo(\n  '[T13] rejects \\'quoted\\' payloads',\n);",
    });

    expect(scanSecurityTests(files)).toEqual({
      open: [
        { id: 'ST03', owner: 'T19', name: 'returns 401 without a token' },
        { id: 'ST03', owner: 'T02', name: "it's 0600" },
        { id: 'ST12', owner: 'T13', name: "rejects 'quoted' payloads" },
      ],
      errors: [],
    });
  });

  it('rejects a todo without an owner', () => {
    const { errors } = scanSecurityTests(
      suite({ 'st04-check.test.ts': "it.todo('returns 421');" }),
    );

    expect(errors).toEqual(['st04-check.test.ts has a todo without a [Txx] owner: returns 421']);
  });

  it.each([
    ['test.todo', "test.todo('[T19] x');"],
    ['describe.todo', "describe.todo('[T19] x');"],
    ['a todo with a template literal', 'it.todo(`[T19] x`);'],
  ])('rejects %s, which it could not count', (_name, source) => {
    const { errors } = scanSecurityTests(suite({ 'st05-check.test.ts': source }));

    expect(errors).toEqual([
      "st05-check.test.ts has a todo that is not it.todo('[Txx] ...') with a string literal",
    ]);
  });

  it.each(["it.skip('x', () => {});", "describe.skip('x', () => {});", 'it.skipIf(true)'])(
    'rejects a skipped test: %s',
    (source) => {
      const { errors } = scanSecurityTests(suite({ 'st06-check.test.ts': source }));

      expect(errors).toEqual([
        "st06-check.test.ts skips a test; use it.todo('[Txx] ...') with an owner instead",
      ]);
    },
  );

  it('allows a runtime skip through the test context', () => {
    const source = "it('x', ({ skip }) => { return skip('not there yet'); });";

    expect(scanSecurityTests(suite({ 'st01-check.test.ts': source })).errors).toEqual([]);
  });

  it('reports each ST test that has no file', () => {
    const files = suite().filter(({ fileName }) => !fileName.startsWith('st07'));

    expect(scanSecurityTests(files).errors).toEqual(['ST07 has no test file']);
  });

  it('reports an ST test with two files', () => {
    const files = [...suite(), { fileName: 'st08-other.test.ts', source: ACTIVE }];

    expect(scanSecurityTests(files).errors).toEqual(['ST08 has more than one file']);
  });

  it.each([
    'st20-extra.test.ts',
    'st00-zero.test.ts',
    'auth.test.ts',
    'st1-short.test.ts',
    'st03_Auth.test.ts',
  ])('rejects the file name %s', (fileName) => {
    const files = [...suite(), { fileName, source: ACTIVE }];

    expect(scanSecurityTests(files).errors).toEqual([
      `${fileName} is not named st01- to st19-<slug>.test.ts`,
    ]);
  });
});

const OPEN: readonly OpenSecurityTest[] = [
  { id: 'ST11', owner: 'T12', name: 'agent logs' },
  { id: 'ST04', owner: 'T19', name: 'host' },
  { id: 'ST03', owner: 'T19', name: 'auth' },
  { id: 'ST11', owner: 'T09', name: 'service logs' },
];

describe('groupByOwner', () => {
  it('groups by task in numeric order, tests in ID order', () => {
    const groups = groupByOwner(OPEN);

    expect([...groups.keys()]).toEqual(['T09', 'T12', 'T19']);
    expect(groups.get('T19')?.map(({ id }) => id)).toEqual(['ST03', 'ST04']);
  });
});

describe('formatReport', () => {
  it('lists open tests under their owning task', () => {
    expect(formatReport(OPEN)).toBe(
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

  it('says so when nothing is open', () => {
    expect(formatReport([])).toBe('All security tests are active.\n');
  });
});
