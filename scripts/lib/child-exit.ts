/** How a child process ended, as reported by its `exit` event. */
export interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** What the parent should do with a child's exit: its own exit code and an optional explanation. */
export interface ExitOutcome {
  readonly exitCode: number;
  readonly message?: string;
}

const EXIT_FAILURE = 1;

/**
 * Turns a child's exit into the parent's outcome. An exit code is passed
 * through as is (on failure the child already printed why). A signal, or an exit with
 * neither code nor signal, fails with a message, since the child had no chance
 * to explain.
 */
export function toExitOutcome(command: string, { code, signal }: ChildExit): ExitOutcome {
  if (signal !== null) {
    return { exitCode: EXIT_FAILURE, message: `${command} was terminated by ${signal}.` };
  }
  if (code === null) {
    return { exitCode: EXIT_FAILURE, message: `${command} exited without an exit code.` };
  }
  return { exitCode: code };
}
