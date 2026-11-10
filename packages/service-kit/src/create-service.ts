import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { type DestinationStream, type Logger, pino } from 'pino';
import type { z } from 'zod';

import { buildApp } from './app.js';
import { type Environment, loadConfig, type ServiceConfig } from './config.js';
import { createPool } from './database.js';
import { runMigrations } from './migrations.js';
import { buildLoggerOptions } from './redaction.js';
import type { Route } from './route.js';

/** Docker sends SIGKILL 10 s after SIGTERM; finish before that. */
const SHUTDOWN_TIMEOUT_MS = 8_000;
const EXIT_FAILURE = 1;
const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export interface ServiceDeps<Extra> {
  readonly db: pg.Pool;
  readonly config: ServiceConfig<Extra>;
  readonly log: Logger;
}

export interface ServiceOptions<Schema extends z.ZodObject> {
  /** Lowercase identifier. It is also the DB role and schema (`SESSIONS_DB_PASSWORD`). */
  readonly name: string;
  readonly routes: readonly Route[] | ((deps: ServiceDeps<z.output<Schema>>) => readonly Route[]);
  /** Directory of `.sql` migrations, applied on start. */
  readonly migrationsDir: string;
  /** The service's own environment variables. The shared ones are always validated. */
  readonly config?: Schema;
  /** Defaults to `process.env`. */
  readonly env?: Environment;
  /** Defaults to stdout. */
  readonly logStream?: DestinationStream;
  /** Install SIGTERM and SIGINT handlers on `start()`. Defaults to true. */
  readonly handleSignals?: boolean;
}

export interface Service<Extra> {
  readonly app: FastifyInstance;
  readonly config: ServiceConfig<Extra>;
  readonly db: pg.Pool;
  readonly log: Logger;
  /** Runs migrations, then listens. On failure it logs, releases everything and rethrows. */
  readonly start: () => Promise<void>;
  /** Stops accepting requests, waits for in-flight ones, then closes the pool. Idempotent. */
  readonly stop: () => Promise<void>;
}

export function createService<Schema extends z.ZodObject = z.ZodObject<Record<never, never>>>(
  options: ServiceOptions<Schema>,
): Service<z.output<Schema>> {
  const config = loadConfig(options.name, options.env ?? process.env, options.config);
  // A `logStream` (tests) wins over pretty development output.
  const pretty = config.development && options.logStream === undefined;
  const loggerOptions = buildLoggerOptions(options.name, config.logLevel, pretty);
  const log =
    options.logStream === undefined ? pino(loggerOptions) : pino(loggerOptions, options.logStream);
  const db = createPool(config.db, options.name);
  // An idle client losing its connection must not crash the process.
  db.on('error', (error) => log.error({ err: error }, 'Idle database client failed'));

  const deps: ServiceDeps<z.output<Schema>> = { db, config, log };
  const routes = typeof options.routes === 'function' ? options.routes(deps) : options.routes;
  const app = buildApp({ logger: log, routes, db });

  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async (): Promise<void> => {
      await app.close();
      await db.end();
    })();
    return stopping;
  };

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

  const start = async (): Promise<void> => {
    try {
      const applied = await runMigrations(
        db,
        { dir: options.migrationsDir, schema: config.db.schema },
        log,
      );
      log.info({ migrations: applied }, 'Migrations applied');
      await app.listen({ host: config.host, port: config.port });
    } catch (error) {
      log.fatal({ err: error }, 'Service failed to start');
      await stop();
      throw error;
    }
    if (options.handleSignals !== false) {
      for (const signal of SIGNALS) {
        process.once(signal, onSignal);
      }
    }
  };

  return { app, config, db, log, start, stop };
}
