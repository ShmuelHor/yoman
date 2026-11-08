import { z } from 'zod';

import {
  exitCodeFor,
  formatReport,
  scanSecurityReport,
  VitestJsonReport,
} from './security-todo.js';

const STRICT_FLAG = '--strict';
const EXIT_FAILURE = 1;

/**
 * `npm run security:todo --strict` (without `--`) hands the flag to npm, which
 * exposes it as npm_config_strict instead of passing it on, so read both.
 */
const NpmEnv = z.object({ npm_config_strict: z.string().optional() });

/** What the CLI needs from the outside world, passed in so it can be tested. */
export interface SecurityTodoIo {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Absolute path of the suite directory, `tests/security`. */
  readonly suiteDir: string;
  /** Runs the suite and returns Vitest's parsed JSON report, still untrusted. */
  readonly runSuite: () => Promise<unknown>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Whether the release gate is on, from `--strict` or npm's `npm_config_strict`. */
export function isStrict(argv: readonly string[], env: SecurityTodoIo['env']): boolean {
  return argv.includes(STRICT_FLAG) || NpmEnv.parse(env).npm_config_strict === 'true';
}

/** Runs `security:todo` and returns its exit code. */
export async function runSecurityTodo(io: SecurityTodoIo): Promise<number> {
  const strict = isStrict(io.argv, io.env);
  const parsed = VitestJsonReport.safeParse(await io.runSuite());
  if (!parsed.success) {
    io.stderr(
      `The Vitest JSON report has an unexpected shape:\n${z.prettifyError(parsed.error)}\n`,
    );
    return EXIT_FAILURE;
  }
  const scan = scanSecurityReport(parsed.data, io.suiteDir);
  io.stdout(formatReport(scan));
  if (scan.errors.length > 0) {
    io.stderr(
      `\nThe security suite cannot be trusted:\n${scan.errors.map((error) => `  ${error}`).join('\n')}\n`,
    );
  }
  const exitCode = exitCodeFor(scan, strict);
  if (strict && exitCode !== 0 && scan.errors.length === 0) {
    io.stderr(`\n${STRICT_FLAG}: every security test must be active and passing.\n`);
  }
  return exitCode;
}
