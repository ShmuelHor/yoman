import { basename, posix } from 'node:path';

import { z } from 'zod';

/**
 * The parts of `docker compose config --format json` that the policy reads.
 * Compose has already normalized the file at this point: ports are objects,
 * volumes are long syntax and memory sizes are byte counts. Unknown fields are
 * stripped rather than rejected, because Compose adds many we don't care about.
 */
const ComposePort = z.object({
  host_ip: z.string().optional(),
  published: z.union([z.string(), z.number()]).optional(),
  target: z.number().int(),
  protocol: z.string().optional(),
});

const ComposeVolume = z.object({
  type: z.string(),
  source: z.string().optional(),
  target: z.string(),
});

const ByteSize = z.union([z.string(), z.number()]);

const ComposeService = z.object({
  image: z.string().optional(),
  build: z.unknown().optional(),
  user: z.string().optional(),
  read_only: z.boolean().optional(),
  privileged: z.boolean().optional(),
  network_mode: z.string().optional(),
  networks: z.record(z.string(), z.unknown()).optional(),
  cap_drop: z.array(z.string()).optional(),
  cap_add: z.array(z.string()).optional(),
  pid: z.string().optional(),
  ipc: z.string().optional(),
  userns_mode: z.string().optional(),
  devices: z.array(z.unknown()).optional(),
  security_opt: z.array(z.string()).optional(),
  mem_limit: ByteSize.optional(),
  deploy: z
    .object({
      resources: z
        .object({ limits: z.object({ memory: ByteSize.optional() }).optional() })
        .optional(),
    })
    .optional(),
  ports: z.array(ComposePort).optional(),
  volumes: z.array(ComposeVolume).optional(),
});

const ComposeNetwork = z.object({
  name: z.string().optional(),
  driver: z.string().optional(),
});

/** A Compose project as printed by `docker compose config --format json`. */
export const ComposeModel = z.object({
  services: z.record(z.string(), ComposeService),
  networks: z.record(z.string(), ComposeNetwork).optional(),
});
export type ComposeModel = z.infer<typeof ComposeModel>;
type ComposeService = z.infer<typeof ComposeService>;

/** Stable identifiers for each rule, so tests can assert which rule failed. */
export type ComposeRule =
  | 'published-port'
  | 'host-network'
  | 'non-root'
  | 'read-only'
  | 'cap-drop'
  | 'cap-add'
  | 'host-namespace'
  | 'devices'
  | 'unconfined-profile'
  | 'no-new-privileges'
  | 'privileged'
  | 'memory-limit'
  | 'docker-socket'
  | 'image-digest';

/** One broken rule in one service. */
export interface ComposeViolation {
  readonly service: string;
  readonly rule: ComposeRule;
  readonly message: string;
}

const WEB_PORT = 4710;
const GATEWAY_PORT = 4711;
const LOOPBACK = '127.0.0.1';

/** The only host bindings Yoman may publish (SECURITY A2). */
export const ALLOWED_BINDINGS: ReadonlySet<string> = new Set([
  `${LOOPBACK}:${String(WEB_PORT)}`,
  `${LOOPBACK}:${String(GATEWAY_PORT)}`,
]);

/**
 * A numeric, non-zero uid with an optional non-zero gid. Names are rejected
 * because the image's /etc/passwd can map any name to uid 0, and forms like
 * `00` or `+0` are rejected because runc parses them as uid 0.
 */
const NON_ROOT_USER = /^[1-9]\d*(?::[1-9]\d*)?$/u;
const NO_NEW_PRIVILEGES = 'no-new-privileges:true';
/** Security profiles that switch off seccomp or AppArmor confinement. */
const UNCONFINED_PROFILES: ReadonlySet<string> = new Set([
  'seccomp:unconfined',
  'seccomp=unconfined',
  'apparmor:unconfined',
  'apparmor=unconfined',
]);
const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/u;
const DOCKER_SOCKET_NAME = 'docker.sock';
/** Where the rootful socket lives; mounting any ancestor of these also exposes it. */
const DOCKER_SOCKET_PATHS = ['/var/run/docker.sock', '/run/docker.sock'];
/** Rootless Docker keeps its socket under the user's runtime directory. */
const ROOTLESS_RUNTIME_DIR = '/run/user';

type ServiceCheck = (service: ComposeService, model: ComposeModel) => readonly string[];

const HOST = 'host';
/** `network_mode: container:<id>` joins a container that may live outside this project. */
const CONTAINER_NETWORK_MODE = 'container:';

function checkPorts(service: ComposeService): readonly string[] {
  return (service.ports ?? []).flatMap((port) => {
    const binding = `${port.host_ip ?? '0.0.0.0'}:${String(port.published ?? 'random')}`;
    return ALLOWED_BINDINGS.has(binding)
      ? []
      : [
          `publishes ${binding} (target ${String(port.target)}); only ${[...ALLOWED_BINDINGS].join(' and ')} are allowed`,
        ];
  });
}

function checkNetworkMode(service: ComposeService): readonly string[] {
  const mode = service.network_mode;
  if (mode === HOST) {
    return ['uses network_mode: host, which bypasses the port policy'];
  }
  if (mode?.startsWith(CONTAINER_NETWORK_MODE) === true) {
    return [`uses network_mode: ${mode}, which joins a container outside the policy`];
  }
  return [];
}

/** Attaching to a network named `host`, or one with the host driver, is host networking too. */
function checkHostNetworks(service: ComposeService, model: ComposeModel): readonly string[] {
  return Object.keys(service.networks ?? {}).flatMap((key) => {
    const network = model.networks?.[key];
    return network?.name === HOST || network?.driver === HOST
      ? [`attaches to network ${key}, which is the host network`]
      : [];
  });
}

function checkUser(service: ComposeService): readonly string[] {
  if (service.user === undefined) {
    return ['has no user, so it runs as root'];
  }
  return NON_ROOT_USER.test(service.user)
    ? []
    : [`has user ${service.user}; it must be a numeric non-zero uid[:gid]`];
}

function checkReadOnly(service: ComposeService): readonly string[] {
  return service.read_only === true ? [] : ['does not set read_only: true'];
}

function checkCapDrop(service: ComposeService): readonly string[] {
  const dropsAll = (service.cap_drop ?? []).some((cap) => cap.toUpperCase() === 'ALL');
  return dropsAll ? [] : ['does not drop ALL capabilities'];
}

/** Docker applies cap_add after cap_drop, so any added capability survives `cap_drop: [ALL]`. */
function checkCapAdd(service: ComposeService): readonly string[] {
  const added = service.cap_add ?? [];
  return added.length === 0 ? [] : [`adds capabilities ${added.join(', ')}`];
}

function checkHostNamespaces(service: ComposeService): readonly string[] {
  const namespaces = { pid: service.pid, ipc: service.ipc, userns_mode: service.userns_mode };
  return Object.entries(namespaces).flatMap(([key, value]) =>
    value === 'host' ? [`shares the host namespace (${key}: host)`] : [],
  );
}

function checkDevices(service: ComposeService): readonly string[] {
  return (service.devices ?? []).length === 0 ? [] : ['maps host devices into the container'];
}

function checkUnconfinedProfiles(service: ComposeService): readonly string[] {
  return (service.security_opt ?? []).flatMap((option) =>
    UNCONFINED_PROFILES.has(option) ? [`disables confinement with security_opt ${option}`] : [],
  );
}

function checkNoNewPrivileges(service: ComposeService): readonly string[] {
  return (service.security_opt ?? []).includes(NO_NEW_PRIVILEGES)
    ? []
    : [`does not set security_opt ${NO_NEW_PRIVILEGES}`];
}

function checkPrivileged(service: ComposeService): readonly string[] {
  return service.privileged === true ? ['runs privileged'] : [];
}

function isPositiveByteCount(size: string | number | undefined): boolean {
  if (size === undefined) {
    return false;
  }
  const bytes = Number(size);
  return Number.isSafeInteger(bytes) && bytes > 0;
}

function checkMemoryLimit(service: ComposeService): readonly string[] {
  const limited =
    isPositiveByteCount(service.mem_limit) ||
    isPositiveByteCount(service.deploy?.resources?.limits?.memory);
  return limited ? [] : ['has no memory limit'];
}

function exposesDockerSocket(source: string): boolean {
  const path = posix.normalize(source).replace(/\/+$/u, '') || '/';
  if (basename(path) === DOCKER_SOCKET_NAME) {
    return true;
  }
  if (path === ROOTLESS_RUNTIME_DIR || path.startsWith(`${ROOTLESS_RUNTIME_DIR}/`)) {
    return true;
  }
  return DOCKER_SOCKET_PATHS.some((socket) => path === '/' || socket.startsWith(`${path}/`));
}

function checkDockerSocket(service: ComposeService): readonly string[] {
  return (service.volumes ?? []).flatMap((volume) =>
    volume.type === 'bind' && volume.source !== undefined && exposesDockerSocket(volume.source)
      ? [`mounts ${volume.source}, which exposes the Docker socket`]
      : [],
  );
}

/**
 * Pulled images must be pinned by digest. A service with `build` runs an image
 * built from this repo, so there is nothing to pin here; its base images are
 * checked in the Dockerfile by hadolint and Trivy.
 */
function checkImageDigest(service: ComposeService): readonly string[] {
  if (service.build !== undefined) {
    return [];
  }
  if (service.image === undefined) {
    return ['has neither image nor build'];
  }
  return DIGEST_PINNED.test(service.image)
    ? []
    : [`uses image ${service.image}, which is not pinned by @sha256 digest`];
}

const CHECKS: ReadonlyArray<readonly [ComposeRule, ServiceCheck]> = [
  ['published-port', checkPorts],
  ['host-network', checkNetworkMode],
  ['host-network', checkHostNetworks],
  ['non-root', checkUser],
  ['read-only', checkReadOnly],
  ['cap-drop', checkCapDrop],
  ['cap-add', checkCapAdd],
  ['host-namespace', checkHostNamespaces],
  ['devices', checkDevices],
  ['no-new-privileges', checkNoNewPrivileges],
  ['unconfined-profile', checkUnconfinedProfiles],
  ['privileged', checkPrivileged],
  ['memory-limit', checkMemoryLimit],
  ['docker-socket', checkDockerSocket],
  ['image-digest', checkImageDigest],
];

/**
 * Checks a normalized Compose model against the container policy in
 * SECURITY.md (A2, A10, A13, A15). Returns every violation, so one run shows
 * everything that needs fixing; an empty array means the model passes.
 */
export function checkComposePolicy(model: ComposeModel): readonly ComposeViolation[] {
  return Object.entries(model.services).flatMap(([name, service]) =>
    CHECKS.flatMap(([rule, check]) =>
      check(service, model).map((message) => ({
        service: name,
        rule,
        message: `${name} ${message}`,
      })),
    ),
  );
}

/** One line per violation, for assertion messages. */
export function formatComposeViolations(violations: readonly ComposeViolation[]): string {
  return violations.map(({ rule, message }) => `[${rule}] ${message}`).join('\n');
}
