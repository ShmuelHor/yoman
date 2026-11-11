import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createAgent } from './core/agent.js';
import { loadAgentToken } from './core/agent-token.js';
import { loadAgentConfig } from './core/config.js';
import { installCrashHandlers } from './core/crash-handlers.js';
import { createLogger } from './core/logger.js';
import { resolveAgentPaths } from './core/paths.js';
import { loadRegistry } from './core/registry.js';
import { createSessionBus } from './core/session-bus.js';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SRC_DIR, '..');
/** The repository's `.env`, where `npm run setup` keeps `AGENT_TOKEN`. */
const ENV_FILE = join(PACKAGE_DIR, '..', '..', '.env');
const EXIT_FAILURE = 1;

const PackageJson = z.object({ version: z.string() });

async function main(): Promise<void> {
  const paths = resolveAgentPaths(process.env);
  const config = await loadAgentConfig(paths.configFile);
  const logger = createLogger({ level: config.logLevel, pretty: config.logFormat === 'pretty' });
  installCrashHandlers({ logger, exit: (code) => process.exit(code), process });

  const agentToken = await loadAgentToken({ env: process.env, envFile: ENV_FILE });
  const agentVersion = PackageJson.parse(
    JSON.parse(await readFile(join(PACKAGE_DIR, 'package.json'), 'utf8')),
  ).version;
  const sessionBus = createSessionBus({
    onError: (error) => {
      logger.warn(
        { error: error instanceof Error ? error.name : typeof error },
        'session bus error',
      );
    },
  });
  const agent = await createAgent({
    config,
    paths,
    logger,
    sessionBus,
    collectors: await loadRegistry({ dir: join(SRC_DIR, 'collectors'), kind: 'collector' }),
    actuators: await loadRegistry({ dir: join(SRC_DIR, 'actuators'), kind: 'actuator' }),
    agentToken,
    agentVersion,
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      process.exit(EXIT_FAILURE);
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    agent.stop().then(
      () => process.exit(0),
      () => process.exit(EXIT_FAILURE),
    );
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  await agent.start();
}

main().catch((error: unknown) => {
  // The logger may not exist yet. Name only, as everywhere: a message can hold a path or secret.
  process.stderr.write(
    `agent failed to start: ${error instanceof Error ? error.name : 'unknown error'}${error instanceof Error && error.name === 'ConfigError' ? `: ${error.message}` : ''}\n`,
  );
  process.exit(EXIT_FAILURE);
});
