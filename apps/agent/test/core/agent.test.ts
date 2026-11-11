import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgent } from '../../src/core/agent.js';
import { AgentConfig } from '../../src/core/config.js';
import { createLogger } from '../../src/core/logger.js';
import type { Actuator, Collector } from '../../src/core/plugin.js';
import { unreachableSessionBus } from '../support/collector-context.js';

async function build(): Promise<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
  calls: string[];
  collect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> {
  const stateDir = await mkdtemp(join(tmpdir(), 'yoman-agent-'));
  const calls: string[] = [];
  const collect = vi.fn().mockResolvedValue([]);
  const collector: Collector = {
    kind: 'collector',
    name: 'fake',
    intervalMs: 1_000,
    collect,
    start: () => {
      calls.push('collector.start');
      return Promise.resolve();
    },
    stop: () => {
      calls.push('collector.stop');
      return Promise.resolve();
    },
  };
  const actuator: Actuator = {
    kind: 'actuator',
    name: 'muter',
    input: z.unknown(),
    run: () => Promise.resolve(),
    start: () => {
      calls.push('actuator.start');
      return Promise.resolve();
    },
    stop: () => {
      calls.push('actuator.stop');
      return Promise.resolve();
    },
  };
  const bus = unreachableSessionBus();
  const close = vi.fn();
  const agent = await createAgent({
    config: AgentConfig.parse({}),
    paths: { stateDir, bufferDir: join(stateDir, 'buffer') },
    logger: createLogger({ level: 'silent' }),
    sessionBus: { ...bus, close },
    collectors: new Map([['fake', collector]]),
    actuators: new Map([['muter', actuator]]),
    agentToken: 'test-token',
    agentVersion: '0.0.0',
    fetch: () => Promise.reject(new Error('no network in tests')),
  });
  return { ...agent, calls, collect, close };
}

describe('createAgent', () => {
  it('starts actuators before collectors and collects on the schedule', async () => {
    const agent = await build();

    await agent.start();
    await vi.waitFor(() => {
      expect(agent.collect).toHaveBeenCalled();
    });
    await agent.stop();

    expect(agent.calls.slice(0, 2)).toEqual(['actuator.start', 'collector.start']);
  });

  it('stops collectors, then actuators, then closes the bus, once', async () => {
    const agent = await build();
    await agent.start();

    await agent.stop();
    await agent.stop();

    expect(agent.calls.slice(2)).toEqual(['collector.stop', 'actuator.stop']);
    expect(agent.close).toHaveBeenCalledTimes(1);
  });
});
