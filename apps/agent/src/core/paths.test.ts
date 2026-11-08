import { describe, expect, it } from 'vitest';
import { resolveAgentPaths } from './paths.js';

describe('resolveAgentPaths', () => {
  it('uses the SPEC locations under HOME by default', () => {
    expect(resolveAgentPaths({ HOME: '/home/u' })).toEqual({
      configFile: '/home/u/.config/yoman/agent.json',
      stateDir: '/home/u/.local/state/yoman',
      bufferDir: '/home/u/.local/state/yoman/buffer',
    });
  });

  it('honors absolute XDG base directories', () => {
    const paths = resolveAgentPaths({
      HOME: '/home/u',
      XDG_CONFIG_HOME: '/cfg',
      XDG_STATE_HOME: '/state',
    });
    expect(paths.configFile).toBe('/cfg/yoman/agent.json');
    expect(paths.bufferDir).toBe('/state/yoman/buffer');
  });

  it('ignores relative XDG base directories', () => {
    const paths = resolveAgentPaths({ HOME: '/home/u', XDG_STATE_HOME: 'state' });
    expect(paths.stateDir).toBe('/home/u/.local/state/yoman');
  });

  it.each([{}, { HOME: 'relative' }])('rejects a missing or relative HOME: %o', (env) => {
    expect(() => resolveAgentPaths(env)).toThrow('HOME');
  });
});
