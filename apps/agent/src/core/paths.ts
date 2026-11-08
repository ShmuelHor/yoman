import { isAbsolute, join } from 'node:path';

/** The environment variables the agent's file locations depend on. */
export interface PathEnv {
  readonly HOME?: string | undefined;
  readonly XDG_CONFIG_HOME?: string | undefined;
  readonly XDG_STATE_HOME?: string | undefined;
}

export interface AgentPaths {
  /** `~/.config/yoman/agent.json` */
  readonly configFile: string;
  /** `~/.local/state/yoman`: everything the agent writes lives here. */
  readonly stateDir: string;
  /** `~/.local/state/yoman/buffer`: one JSONL file per hour (SPEC §4.3). */
  readonly bufferDir: string;
}

const APP_DIR = 'yoman';

/** XDG says a relative base directory is invalid and must be ignored. */
function xdgBase(value: string | undefined, fallback: string): string {
  return value !== undefined && isAbsolute(value) ? value : fallback;
}

/** Resolves the agent's config and state locations, following the XDG base directory spec. */
export function resolveAgentPaths(env: PathEnv): AgentPaths {
  const home = env.HOME;
  if (home === undefined || !isAbsolute(home)) {
    throw new Error('HOME must be set to an absolute path');
  }
  const configHome = xdgBase(env.XDG_CONFIG_HOME, join(home, '.config'));
  const stateHome = xdgBase(env.XDG_STATE_HOME, join(home, '.local', 'state'));
  const stateDir = join(stateHome, APP_DIR);
  return {
    configFile: join(configHome, APP_DIR, 'agent.json'),
    stateDir,
    bufferDir: join(stateDir, 'buffer'),
  };
}
