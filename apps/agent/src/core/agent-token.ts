import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { AgentToken } from '../sender/adapters/ingest-client.js';
import { ConfigError } from './config.js';

const TOKEN_KEY = 'AGENT_TOKEN';

export interface AgentTokenSources {
  /** The process environment: wins over the file, so a service manager can inject it. */
  readonly env: { readonly AGENT_TOKEN?: string | undefined };
  /** The repository's `.env`, written by `npm run setup`. Read for one key only. */
  readonly envFile: string;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readFromFile(path: string): Promise<string | undefined> {
  try {
    return parseEnv(await readFile(path, 'utf8'))[TOKEN_KEY];
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Finds the gateway token. Only this one key is taken from `.env`, so the
 * database passwords in the same file never enter the agent's process, which
 * starts other programs (gsettings). Errors never include the value.
 */
export async function loadAgentToken(sources: AgentTokenSources): Promise<string> {
  const raw = sources.env.AGENT_TOKEN ?? (await readFromFile(sources.envFile));
  if (raw === undefined || raw === '') {
    throw new ConfigError(`${TOKEN_KEY} is not set; run \`npm run setup\``);
  }
  const token = AgentToken.safeParse(raw);
  if (!token.success) {
    throw new ConfigError(`${TOKEN_KEY} is malformed; run \`npm run setup\` on a fresh .env`);
  }
  return token.data;
}
