import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadComposeProject } from './lib/compose-config.js';
import type { ComposeModel } from './lib/compose-policy.js';
import { checkEgress } from './lib/egress-policy.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Spawning the Compose CLI takes longer than Vitest's 5s default on a cold machine. */
const COMPOSE_TIMEOUT_MS = 30_000;

const NETWORKS: NonNullable<ComposeModel['networks']> = {
  core: { internal: true },
  edge: {},
};

function modelOf(services: ComposeModel['services']): ComposeModel {
  return { services, networks: NETWORKS };
}

describe('ST18 no container egress', () => {
  it('accepts internal-only backends and one external network for web and gateway', () => {
    const model = modelOf({
      postgres: { networks: { core: null } },
      sessions: { networks: { core: null } },
      gateway: { networks: { core: null, edge: null } },
      web: { networks: { edge: null } },
    });

    expect(checkEgress(model)).toEqual([]);
  });

  it('rejects a backend on a network with a route out', () => {
    const model = modelOf({ sessions: { networks: { core: null, edge: null } } });

    expect(checkEgress(model)).toEqual(['sessions is on non-internal network edge']);
  });

  it('rejects a service with no explicit network, since Compose gives it a default one', () => {
    expect(checkEgress(modelOf({ postgres: {} }))).toHaveLength(1);
  });

  it('rejects host networking on any service', () => {
    expect(checkEgress(modelOf({ web: { network_mode: 'host' } }))).toHaveLength(1);
  });

  it('rejects a backend that publishes a port', () => {
    const model = modelOf({
      sessions: { networks: { core: null }, ports: [{ target: 3000 }] },
    });

    expect(checkEgress(model)).toHaveLength(1);
  });

  it('rejects web or gateway on a second non-internal network', () => {
    const model: ComposeModel = {
      services: { web: { networks: { edge: null, other: null } } },
      networks: { ...NETWORKS, other: {} },
    };

    expect(checkEgress(model)).toHaveLength(1);
  });

  it(
    'the repo Compose project gives no backend a route to the internet',
    async () => {
      const model = await loadComposeProject(REPO_ROOT);

      expect(checkEgress(model)).toEqual([]);
    },
    COMPOSE_TIMEOUT_MS,
  );
});
