import type { FastifyInstance } from 'fastify';
import type { DestinationStream, Logger } from 'pino';

import { buildGateway } from './app.js';
import { type Environment, loadConfig } from './config.js';
import { installCrashHandlers } from './crash-handlers.js';
import { type ConnectDatabase, connectDatabase, type GatewayDatabase } from './database.js';
import { createLogger } from './logger.js';
import { loadRouteHandlers } from './route-loader.js';
import { createServiceClient } from './service-client.js';

/** Docker sends SIGKILL 10 s after SIGTERM; finish before that. */
const SHUTDOWN_TIMEOUT_MS = 8_000;
const EXIT_FAILURE = 1;
const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export interface StartOptions {
  /** Defaults to `process.env`. */
  readonly env?: Environment;
  /** Where the route modules live: `src/routes` under Vitest, `dist/routes` in the image. */
  readonly routesDir: string;
  /** Defaults to stdout. */
  readonly logStream?: DestinationStream;
  /** Opens the database and migrates it. Defaults to the real one; tests pass a stub. */
  readonly connectDatabase?: ConnectDatabase;
  /** Install SIGTERM and SIGINT handlers. Defaults to true. */
  readonly handleSignals?: boolean;
}

export interface RunningGateway {
  readonly app: FastifyInstance;
  readonly log: Logger;
  /** Stops accepting requests, waits for in-flight ones and closes the database. Idempotent. */
  readonly stop: () => Promise<void>;
}

function installSignalHandlers(log: Logger, stop: () => Promise<void>): void {
  const onSignal = (signal: NodeJS.Signals): void => {
    log.info({ signal }, 'Shutting down');
    const force = setTimeout(() => {
      log.error('Shutdown timed out');
      process.exit(EXIT_FAILURE);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    stop().then(
      () => clearTimeout(force),
      (error: unknown) => {
        log.error({ err: error }, 'Shutdown failed');
        process.exitCode = EXIT_FAILURE;
      },
    );
  };
  for (const signal of SIGNALS) {
    process.once(signal, onSignal);
  }
}

/** Validates the environment, loads the route modules and listens. */
export async function startGateway(options: StartOptions): Promise<RunningGateway> {
  const config = loadConfig(options.env ?? process.env);
  const log = createLogger(config.logLevel, options.logStream, config.logFormat === 'pretty');
  let database: GatewayDatabase | undefined;
  try {
    database = await (options.connectDatabase ?? connectDatabase)(config.db, log);
    const app = await buildGateway({
      logger: log,
      agentToken: config.agentToken,
      services: createServiceClient({ urls: config.serviceUrls, log }),
      handlers: await loadRouteHandlers({ dir: options.routesDir }),
      apiDocs: config.development,
    });
    let stopping: Promise<void> | undefined;
    const stop = (): Promise<void> => {
      stopping ??= app.close().then(() => database?.close());
      return stopping;
    };
    await app.listen({ host: config.host, port: config.port });
    if (options.handleSignals !== false) {
      installSignalHandlers(log, stop);
      installCrashHandlers(log);
    }
    return { app, log, stop };
  } catch (error: unknown) {
    log.fatal({ err: error }, 'Gateway failed to start');
    await database?.close();
    throw error;
  }
}
