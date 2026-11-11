import type { Logger } from 'pino';

const EXIT_FAILURE = 1;

export interface CrashProcess {
  on(event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void): void;
  exit(code: number): void;
}

/**
 * An unhandled rejection or exception leaves the process in an unknown state,
 * so it is logged once and the process exits: the container's restart policy
 * (or systemd for the agent) brings it back clean.
 */
export function installCrashHandlers(
  log: Pick<Logger, 'fatal'>,
  proc: CrashProcess = process,
): void {
  const crash =
    (event: string) =>
    (reason: unknown): void => {
      log.fatal({ err: reason, event }, 'Unhandled failure, exiting for a restart');
      proc.exit(EXIT_FAILURE);
    };
  proc.on('uncaughtException', crash('uncaughtException'));
  proc.on('unhandledRejection', crash('unhandledRejection'));
}
