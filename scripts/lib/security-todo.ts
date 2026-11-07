/**
 * Finds the security tests (SECURITY.md section 3) that are still `it.todo`.
 *
 * Each ST test lives in `tests/security/stNN-<slug>.test.ts`. A test that is
 * not active yet is written as `it.todo('[T19] what it checks')`: the bracketed
 * task ID names the task that must turn it into a real test. The source is
 * read as text rather than run, so the report needs no test runner.
 *
 * Parsing fails closed: a todo without an owner, a skipped test, a misnamed
 * file or a missing ST ID is an error, because each could hide an open test.
 */

/** The number of ST tests SECURITY.md section 3 defines. */
export const SECURITY_TEST_COUNT = 19;

const ID_WIDTH = 2;
const FILE_NAME = /^st(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.test\.ts$/u;
const TODO_CALL = /\bit\.todo\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/gu;
const ANY_TODO = /\.todo\(/gu;
const SKIP_CALL = /\b(?:it|test|describe)\.(?:skip|skipIf)\(/u;
const OWNED_NAME = /^\[(T\d{2})\]\s+(\S.*)$/u;

/** One security test file, by file name (not path) and source text. */
export interface SecurityTestSource {
  readonly fileName: string;
  readonly source: string;
}

/** One `it.todo` that is still open, with the task that owns it. */
export interface OpenSecurityTest {
  /** For example `ST03`. */
  readonly id: string;
  /** For example `T19`. */
  readonly owner: string;
  readonly name: string;
}

/** Everything the scan found: the open tests, and any reason the scan cannot be trusted. */
export interface SecurityTodoScan {
  readonly open: readonly OpenSecurityTest[];
  readonly errors: readonly string[];
}

function toId(index: number): string {
  return `ST${String(index).padStart(ID_WIDTH, '0')}`;
}

function unescapeQuotes(name: string): string {
  return name.replace(/\\(.)/gu, '$1');
}

function scanFile(id: string, { fileName, source }: SecurityTestSource): SecurityTodoScan {
  const errors: string[] = [];
  if (SKIP_CALL.test(source)) {
    errors.push(`${fileName} skips a test; use it.todo('[Txx] ...') with an owner instead`);
  }
  const calls = [...source.matchAll(TODO_CALL)];
  const todoCount = [...source.matchAll(ANY_TODO)].length;
  if (calls.length !== todoCount) {
    errors.push(`${fileName} has a todo that is not it.todo('[Txx] ...') with a string literal`);
  }
  const open = calls.flatMap((call): OpenSecurityTest[] => {
    const name = unescapeQuotes(call[2] ?? '');
    const owned = OWNED_NAME.exec(name);
    const owner = owned?.[1];
    const rest = owned?.[2];
    if (owner === undefined || rest === undefined) {
      errors.push(`${fileName} has a todo without a [Txx] owner: ${name}`);
      return [];
    }
    return [{ id, owner, name: rest }];
  });
  return { open, errors };
}

/**
 * Scans every security test file. Reports an error for each file whose name
 * doesn't follow `stNN-<slug>.test.ts`, each duplicate or out-of-range ID,
 * and each of ST01 to ST19 that has no file.
 */
export function scanSecurityTests(files: readonly SecurityTestSource[]): SecurityTodoScan {
  const open: OpenSecurityTest[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const index = Number(FILE_NAME.exec(file.fileName)?.[1]);
    if (!Number.isInteger(index) || index < 1 || index > SECURITY_TEST_COUNT) {
      errors.push(
        `${file.fileName} is not named st01- to st${String(SECURITY_TEST_COUNT)}-<slug>.test.ts`,
      );
      continue;
    }
    const id = toId(index);
    if (seen.has(id)) {
      errors.push(`${id} has more than one file`);
    }
    seen.add(id);
    const result = scanFile(id, file);
    open.push(...result.open);
    errors.push(...result.errors);
  }
  for (let index = 1; index <= SECURITY_TEST_COUNT; index += 1) {
    if (!seen.has(toId(index))) {
      errors.push(`${toId(index)} has no test file`);
    }
  }
  return { open, errors };
}

/** Open tests grouped by owning task, tasks in numeric order and tests in ID order. */
export function groupByOwner(
  open: readonly OpenSecurityTest[],
): ReadonlyMap<string, readonly OpenSecurityTest[]> {
  const sorted = [...open].sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id),
  );
  const groups = new Map<string, OpenSecurityTest[]>();
  for (const test of sorted) {
    groups.set(test.owner, [...(groups.get(test.owner) ?? []), test]);
  }
  return groups;
}

/** A plain-text report of the open tests, one block per owning task. */
export function formatReport(open: readonly OpenSecurityTest[]): string {
  if (open.length === 0) {
    return 'All security tests are active.\n';
  }
  const blocks = [...groupByOwner(open)].map(
    ([owner, tests]) =>
      `${owner} (${String(tests.length)})\n${tests.map(({ id, name }) => `  ${id}  ${name}`).join('\n')}`,
  );
  return `${String(open.length)} security test(s) still todo:\n\n${blocks.join('\n\n')}\n`;
}
