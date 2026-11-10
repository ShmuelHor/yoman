import type { ComposeModel } from './compose-policy.js';

/** The only services that publish a port, and so may sit on a network with a route out. */
const EDGE_SERVICES: ReadonlySet<string> = new Set(['web', 'gateway']);
const MAX_EXTERNAL_NETWORKS_PER_EDGE_SERVICE = 1;

/**
 * Finds services that could reach the internet (SECURITY.md goal 1: data never
 * leaves the machine). Every service except web and gateway must be attached
 * only to `internal: true` networks, which Docker gives no route out. Web and
 * gateway need one non-internal network so loopback publishing works, and
 * nothing more.
 */
export function checkEgress(model: ComposeModel): readonly string[] {
  return Object.entries(model.services).flatMap(([name, service]) =>
    checkService(name, service, model),
  );
}

type Service = ComposeModel['services'][string];

function checkService(name: string, service: Service, model: ComposeModel): readonly string[] {
  if (service.network_mode?.startsWith('service:')) {
    return []; // Shares another service's stack, which is checked itself.
  }
  if (service.network_mode !== undefined) {
    return [`${name} sets network_mode ${service.network_mode}`];
  }
  const attached = Object.keys(service.networks ?? {});
  if (attached.length === 0) {
    return [`${name} is on no explicit network, so it lands on a default one with egress`];
  }
  const external = attached.filter((key) => model.networks?.[key]?.internal !== true);
  return EDGE_SERVICES.has(name)
    ? checkEdge(name, external)
    : checkBackend(name, service, external);
}

function checkEdge(name: string, external: readonly string[]): readonly string[] {
  return external.length > MAX_EXTERNAL_NETWORKS_PER_EDGE_SERVICE
    ? [`${name} is on ${external.length} non-internal networks: ${external.join(', ')}`]
    : [];
}

function checkBackend(
  name: string,
  service: Service,
  external: readonly string[],
): readonly string[] {
  const problems: string[] = [];
  if (external.length > 0) {
    problems.push(`${name} is on non-internal network ${external.join(', ')}`);
  }
  if ((service.ports ?? []).length > 0) {
    problems.push(`${name} publishes a port but only web and gateway may`);
  }
  return problems;
}
