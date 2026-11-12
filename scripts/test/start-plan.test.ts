import { describe, expect, it } from 'vitest';

import { AGENT_COMMAND, planStartSteps, STOP_STEP } from '../lib/start-plan.js';

describe('planStartSteps', () => {
  it('runs setup first when .env is missing', () => {
    const steps = planStartSteps({ envExists: false });

    expect(steps.map((step) => step.command)).toEqual(['npm', 'npm', 'docker']);
    expect(steps[0]?.args).toContain('setup');
  });

  it('skips setup when .env exists', () => {
    const steps = planStartSteps({ envExists: true });

    expect(steps.map((step) => step.command)).toEqual(['npm', 'docker']);
    expect(steps.flatMap((step) => step.args)).not.toContain('setup');
  });

  it('rebuilds the shared packages before the agent runs, so its contracts are not stale', () => {
    const steps = planStartSteps({ envExists: true });

    expect(steps[0]?.args).toContain('build:packages');
  });

  it('builds and waits for a healthy stack', () => {
    const stack = planStartSteps({ envExists: true }).at(-1);

    expect(stack?.args).toEqual(expect.arrayContaining(['up', '--detach', '--build', '--wait']));
  });

  it('runs the agent through the npm script and stops the stack with compose down', () => {
    expect(AGENT_COMMAND.args).toContain('agent:dev');
    expect(STOP_STEP.args).toEqual(['compose', 'down']);
  });
});
