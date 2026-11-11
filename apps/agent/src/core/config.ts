import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/** The gateway is published on loopback only (SECURITY: network rules). */
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4711';
const LOOPBACK_HOST = '127.0.0.1';

const GatewayUrl = z.url({ protocol: /^http$/, hostname: /^127\.0\.0\.1$/ }).refine((value) => {
  // Zod runs refinements even after the url check failed, so the parse must not throw.
  const url = URL.parse(value);
  return url?.hostname === LOOPBACK_HOST && url.href === `${url.origin}/`;
}, 'must be a bare http://127.0.0.1:<port> origin');

export const LogLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
export type LogLevel = z.infer<typeof LogLevel>;

/** Readable lines for a terminal, or JSON for filtering and `journalctl`. */
export const LogFormat = z.enum(['pretty', 'json']);
export type LogFormat = z.infer<typeof LogFormat>;

/** `~/.config/yoman/agent.json`. Every key is optional; unknown keys are rejected. */
export const AgentConfig = z.strictObject({
  gatewayUrl: GatewayUrl.default(DEFAULT_GATEWAY_URL),
  logLevel: LogLevel.default('info'),
  logFormat: LogFormat.default('pretty'),
});
export type AgentConfig = z.infer<typeof AgentConfig>;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Parses config text. Error messages name the offending keys only, never their
 * values, so a misplaced secret in the file never reaches a log.
 */
export function parseAgentConfig(text: string): AgentConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigError('agent config is not valid JSON');
  }
  const result = AgentConfig.safeParse(raw);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.') || '(root)');
    throw new ConfigError(`agent config is invalid at: ${[...new Set(keys)].join(', ')}`);
  }
  return result.data;
}

/** Loads the config file. A missing file means "all defaults". */
export async function loadAgentConfig(path: string): Promise<AgentConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return AgentConfig.parse({});
    }
    throw error;
  }
  return parseAgentConfig(text);
}
