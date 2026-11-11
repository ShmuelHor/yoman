import { createIngestClient, type FetchFn } from '../sender/adapters/ingest-client.js';
import { muteOnReply } from '../sender/mute-handler.js';
import { notifyEach } from '../sender/reply-handlers.js';
import { createSender } from '../sender/sender.js';
import { createBuffer } from './buffer.js';
import type { AgentConfig } from './config.js';
import { logCollectorError } from './error-log.js';
import type { AgentLogger } from './logger.js';
import type { AgentPaths } from './paths.js';
import type { CollectorContext, PluginContext } from './plugin.js';
import { createPresenceTracker } from './presence.js';
import {
  type Registry,
  runActuator,
  scheduleCollectors,
  startPlugins,
  stopPlugins,
} from './registry.js';
import { createScheduler } from './scheduler.js';
import type { SessionBus } from './session-bus.js';

export const NOTIFIER_ACTUATOR = 'notifier';
export const MUTER_ACTUATOR = 'muter';

export interface AgentDeps {
  readonly config: AgentConfig;
  readonly paths: Pick<AgentPaths, 'stateDir' | 'bufferDir'>;
  readonly logger: AgentLogger;
  readonly sessionBus: SessionBus;
  readonly collectors: Registry<'collector'>;
  readonly actuators: Registry<'actuator'>;
  readonly agentToken: string;
  readonly agentVersion: string;
  readonly fetch?: FetchFn;
}

export interface Agent {
  start(): Promise<void>;
  /** Idempotent. Restores anything the muter changed before it returns. */
  stop(): Promise<void>;
}

/**
 * Wires collectors, buffer, sender and actuators (SPEC §4). Nothing runs until
 * `start`; presence pauses the collectors and the sender together while the
 * screen is locked (SPEC §4.4).
 */
export async function createAgent(deps: AgentDeps): Promise<Agent> {
  const { logger } = deps;
  const buffer = await createBuffer({ ...deps.paths, logger });
  const scheduler = createScheduler({ onError: logCollectorError(logger) });
  const pluginContext: PluginContext = { logger, sessionBus: deps.sessionBus };

  const sender = createSender({
    buffer,
    logger,
    agentVersion: deps.agentVersion,
    client: createIngestClient({
      gatewayUrl: deps.config.gatewayUrl,
      agentToken: deps.agentToken,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    }),
    replyHandlers: [
      notifyEach(NOTIFIER_ACTUATOR, (alert) =>
        runActuator(deps.actuators, NOTIFIER_ACTUATOR, { alert }, pluginContext),
      ),
      muteOnReply(MUTER_ACTUATOR, (request) =>
        runActuator(deps.actuators, MUTER_ACTUATOR, request, pluginContext),
      ),
    ],
  });

  const tracker = createPresenceTracker({
    pause(): void {
      scheduler.pause();
      sender.pause();
    },
    resume(): void {
      scheduler.resume();
      sender.resume();
    },
  });
  const collectorContext: CollectorContext = {
    ...pluginContext,
    emit: (samples) => buffer.append(samples),
    presence: tracker.presence,
    reportPresence: (update) => {
      tracker.report(update);
    },
  };
  const onPluginError = (name: string, error: unknown): void => {
    logger.error(
      { plugin: name, error: error instanceof Error ? error.name : typeof error },
      'plugin failed to stop',
    );
  };
  let stopped = false;

  return {
    async start(): Promise<void> {
      // Actuators first: the muter restores what a crash left muted before any focus command.
      await startPlugins(deps.actuators.values(), collectorContext);
      await startPlugins(deps.collectors.values(), collectorContext);
      scheduleCollectors(scheduler, deps.collectors, collectorContext);
      scheduler.start();
      sender.start();
      logger.info(
        { collectors: deps.collectors.size, actuators: deps.actuators.size },
        'agent started',
      );
    },
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      scheduler.stop();
      await sender.stop();
      await stopPlugins(deps.collectors.values(), onPluginError);
      await stopPlugins(deps.actuators.values(), onPluginError);
      deps.sessionBus.close();
      logger.info('agent stopped');
    },
  };
}
