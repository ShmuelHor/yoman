/** One command `npm start` runs before the agent. */
export interface StartStep {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

/** The web is published on loopback only (SECURITY: network rules). */
export const WEB_URL = 'http://127.0.0.1:4710/';
/** A cold build plus Postgres init fits well inside this. */
export const HEALTHY_TIMEOUT_SECONDS = 300;

/**
 * The commands before the agent. `setup` runs only when `.env` is missing:
 * it is safe to re-run, but the quiet path should not print on every start.
 * `--wait` returns once every service with a healthcheck is healthy, and
 * fails if one is not within the timeout.
 */
export function planStartSteps(options: { readonly envExists: boolean }): readonly StartStep[] {
  const setup: StartStep = {
    label: 'Creating .env',
    command: 'npm',
    args: ['run', '--silent', 'setup'],
  };
  const stack: StartStep = {
    label: 'Starting the stack',
    command: 'docker',
    args: [
      'compose',
      'up',
      '--detach',
      '--build',
      '--wait',
      '--wait-timeout',
      String(HEALTHY_TIMEOUT_SECONDS),
    ],
  };
  // The agent imports the shared contracts from their build. A stale build
  // rejects replies carrying fields added since (a strict object fails at the root).
  const build: StartStep = {
    label: 'Building the shared packages',
    command: 'npm',
    args: ['run', '--silent', 'build:packages'],
  };
  return options.envExists ? [build, stack] : [setup, build, stack];
}

/** The agent runs in the foreground, so Ctrl+C stops it. */
export const AGENT_COMMAND: Pick<StartStep, 'command' | 'args'> = {
  command: 'npm',
  args: ['run', '--silent', 'agent:dev'],
};

export const STOP_STEP: StartStep = {
  label: 'Stopping the stack',
  command: 'docker',
  args: ['compose', 'down'],
};
