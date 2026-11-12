import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AGENT_COMMAND, planStartSteps, STOP_STEP } from '../lib/start-plan.js';

describe('planStartSteps', () => {
  it('runs setup first when .env is missing', () => {
    const steps = planStartSteps({ envExists: false });

    expect(steps.map((step) => step.command)).toEqual(['npm', 'docker']);
    expect(steps[0]?.args).toContain('setup');
  });

  it('skips setup when .env exists', () => {
    const steps = planStartSteps({ envExists: true });

    expect(steps).toHaveLength(1);
    expect(steps[0]?.command).toBe('docker');
  });

  it('builds and waits for a healthy stack', () => {
    const [stack] = planStartSteps({ envExists: true });

    expect(stack?.args).toEqual(expect.arrayContaining(['up', '--detach', '--build', '--wait']));
  });

  it('runs the agent through the npm script and stops the stack with compose down', () => {
    expect(AGENT_COMMAND.args).toContain('agent:dev');
    expect(STOP_STEP.args).toEqual(['compose', 'down']);
  });
});

describe('the agent:dev script', () => {
  it('builds the shared packages first, so the agent never loads a stale contract build', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    );
    const script = z.object({ scripts: z.object({ 'agent:dev': z.string() }) }).parse(manifest)
      .scripts['agent:dev'];

    expect(script.indexOf('build:packages')).toBeGreaterThanOrEqual(0);
    expect(script.indexOf('build:packages')).toBeLessThan(script.indexOf('tsx'));
  });
});
