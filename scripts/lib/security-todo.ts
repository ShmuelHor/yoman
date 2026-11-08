/**
 * Turns Vitest's JSON report of the security suite (SECURITY.md section 3)
 * into the list of tests that are not active yet, and decides whether the
 * release gate passes.
 *
 * Each ST test lives in `tests/security/stNN-<slug>.test.ts`. A test that is
 * not active yet is written as `it.todo('[T19] what it checks')`: the bracketed
 * task ID names the task that must turn it into a real test.
 *
 * The report is the source of truth rather than the test source, because only
 * the runner knows every way a test can end up not running: `.skip` and its
 * chained forms, `skipIf` and `runIf`, a context `skip()`, `.only` and `.fails`.
 */
import { posix } from 'node:path';

import { z } from 'zod';

/** The number of ST tests SECURITY.md section 3 defines. */
export const SECURITY_TEST_COUNT = 19;

const ID_WIDTH = 2;
const FILE_NAME = /^st(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.test\.ts$/u;
const OWNED_NAME = /^\[(T\d{2})\]\s+(\S.*)$/u;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const AssertionStatus = z.enum(['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled']);

/** The parts of Vitest's `--reporter=json` output that the gate reads. */
export const VitestJsonReport = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['passed', 'failed']),
      message: z.string(),
      assertionResults: z.array(
        z.object({
          fullName: z.string(),
          title: z.string(),
          status: AssertionStatus,
          meta: z.object({ failsByDesign: z.boolean().optional() }),
        }),
      ),
    }),
  ),
});
export type VitestJsonReport = z.infer<typeof VitestJsonReport>;

/** One `it.todo` that is still open, with the task that owns it. */
export interface OpenSecurityTest {
  /** For example `ST03`. */
  readonly id: string;
  /** For example `T19`. */
  readonly owner: string;
  readonly name: string;
}

/** Why a test that should be running isn't proving anything. */
export type InactiveReason = 'skipped' | 'failed' | 'fails-by-design';

/** A test that is neither passing nor an owned todo. */
export interface InactiveSecurityTest {
  readonly id: string;
  readonly name: string;
  readonly reason: InactiveReason;
}

/** Everything the report says about the suite. */
export interface SecurityTodoScan {
  readonly open: readonly OpenSecurityTest[];
  readonly inactive: readonly InactiveSecurityTest[];
  /** Problems that make the report untrustworthy; these fail even without --strict. */
  readonly errors: readonly string[];
}

type FileResult = VitestJsonReport['testResults'][number];
type AssertionResult = FileResult['assertionResults'][number];

function toId(index: number): string {
  return `ST${String(index).padStart(ID_WIDTH, '0')}`;
}

/** The ST ID of a test file, or undefined when it isn't `stNN-<slug>.test.ts` directly in the suite. */
function idOf(relativePath: string): string | undefined {
  const index = Number(FILE_NAME.exec(relativePath)?.[1]);
  return Number.isInteger(index) && index >= 1 && index <= SECURITY_TEST_COUNT
    ? toId(index)
    : undefined;
}

function inactiveReason(test: AssertionResult): InactiveReason | undefined {
  switch (test.status) {
    case 'failed':
      return 'failed';
    case 'skipped':
    case 'pending':
    case 'disabled':
      return 'skipped';
    default:
      return test.meta.failsByDesign === true ? 'fails-by-design' : undefined;
  }
}

interface FileScan {
  readonly open: OpenSecurityTest[];
  readonly inactive: InactiveSecurityTest[];
  readonly errors: string[];
}

function scanFile(id: string, path: string, file: FileResult, scan: FileScan): void {
  if (
    file.status === 'failed' &&
    file.assertionResults.every(({ status }) => status !== 'failed')
  ) {
    scan.errors.push(`${path} failed to run: ${file.message || 'no message'}`);
  }
  for (const test of file.assertionResults) {
    if (test.status === 'todo') {
      const owned = OWNED_NAME.exec(test.title);
      const owner = owned?.[1];
      const name = owned?.[2];
      if (owner === undefined || name === undefined) {
        scan.errors.push(`${path} has a todo without a [Txx] owner: ${test.title}`);
      } else {
        scan.open.push({ id, owner, name });
      }
      continue;
    }
    const reason = inactiveReason(test);
    if (reason !== undefined) {
      scan.inactive.push({ id, name: test.fullName, reason });
    }
  }
}

/**
 * Reads a Vitest JSON report of the security suite. Each file must be
 * `stNN-<slug>.test.ts` directly inside `suiteDir`, and each of ST01 to ST19
 * must have exactly one file.
 */
export function scanSecurityReport(report: VitestJsonReport, suiteDir: string): SecurityTodoScan {
  const scan: FileScan = { open: [], inactive: [], errors: [] };
  const seen = new Set<string>();
  for (const file of report.testResults) {
    const path = posix.relative(suiteDir, file.name);
    const id = idOf(path);
    if (id === undefined) {
      scan.errors.push(
        `${path} is not named st01- to st${String(SECURITY_TEST_COUNT)}-<slug>.test.ts directly in the suite`,
      );
      continue;
    }
    if (seen.has(id)) {
      scan.errors.push(`${id} has more than one file`);
    }
    seen.add(id);
    scanFile(id, path, file, scan);
  }
  for (let index = 1; index <= SECURITY_TEST_COUNT; index += 1) {
    if (!seen.has(toId(index))) {
      scan.errors.push(`${toId(index)} has no test file`);
    }
  }
  return scan;
}

/**
 * The exit code of `security:todo`. Errors and failing tests always fail.
 * With `strict` (the release gate), open todos and skipped or `.fails` tests
 * fail too.
 */
export function exitCodeFor(scan: SecurityTodoScan, strict: boolean): number {
  const failing = scan.inactive.some(({ reason }) => reason === 'failed');
  if (scan.errors.length > 0 || failing) {
    return EXIT_FAILURE;
  }
  return strict && (scan.open.length > 0 || scan.inactive.length > 0) ? EXIT_FAILURE : EXIT_SUCCESS;
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

function formatOpen(open: readonly OpenSecurityTest[]): string {
  if (open.length === 0) {
    return 'No security test is still todo.\n';
  }
  const blocks = [...groupByOwner(open)].map(
    ([owner, tests]) =>
      `${owner} (${String(tests.length)})\n${tests.map(({ id, name }) => `  ${id}  ${name}`).join('\n')}`,
  );
  return `${String(open.length)} security test(s) still todo:\n\n${blocks.join('\n\n')}\n`;
}

function formatInactive(inactive: readonly InactiveSecurityTest[]): string {
  if (inactive.length === 0) {
    return '';
  }
  const lines = inactive.map(({ id, name, reason }) => `  ${id}  ${reason}  ${name}`);
  return `\n${String(inactive.length)} security test(s) not proving anything:\n${lines.join('\n')}\n`;
}

/** A plain-text report: open todos by owning task, then skipped, failing and `.fails` tests. */
export function formatReport(scan: SecurityTodoScan): string {
  return formatOpen(scan.open) + formatInactive(scan.inactive);
}
