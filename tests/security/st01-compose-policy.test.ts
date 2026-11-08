import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadComposeFile, loadComposeProject } from './lib/compose-config.js';
import {
  type ComposeModel,
  type ComposeRule,
  checkComposePolicy,
  formatComposeViolations,
} from './lib/compose-policy.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** In-memory models pretend the project lives here. */
const PROJECT = '/srv/yoman';
const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/compose/${name}`, import.meta.url));

async function loadFixture(name: string): Promise<ComposeModel> {
  const file = fixture(name);
  return loadComposeFile(file, dirname(file));
}

/** Spawning the Compose CLI takes longer than Vitest's 5s default on a cold machine. */
const COMPOSE_TIMEOUT_MS = 30_000;
const WEB_PORT = 4710;
const GATEWAY_PORT = 4711;
const CONTAINER_PORT = 8080;
const MEMORY_BYTES = 134_217_728;
const DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

/** A service that passes every rule; each test below breaks one thing. */
function compliantService(): ComposeModel['services'][string] {
  return {
    image: `nginx@${DIGEST}`,
    user: '1000:1000',
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    mem_limit: String(MEMORY_BYTES),
    ports: [
      {
        host_ip: '127.0.0.1',
        published: String(WEB_PORT),
        target: CONTAINER_PORT,
        protocol: 'tcp',
      },
    ],
  };
}

function modelWith(overrides: Partial<ComposeModel['services'][string]>): ComposeModel {
  return { services: { web: { ...compliantService(), ...overrides } } };
}

function rulesBroken(model: ComposeModel, projectRoot = PROJECT): readonly ComposeRule[] {
  return checkComposePolicy(model, projectRoot).map(({ rule }) => rule);
}

describe('ST01 compose policy', () => {
  describe('policy rules', () => {
    it('accepts a service that follows every rule', () => {
      expect(checkComposePolicy(modelWith({}), PROJECT)).toEqual([]);
    });

    it('accepts both allowed loopback ports', () => {
      const model = modelWith({
        ports: [
          { host_ip: '127.0.0.1', published: String(WEB_PORT), target: WEB_PORT },
          { host_ip: '127.0.0.1', published: GATEWAY_PORT, target: GATEWAY_PORT },
        ],
      });

      expect(rulesBroken(model)).toEqual([]);
    });

    it.each([
      ['an extra port', { host_ip: '127.0.0.1', published: '4712', target: 4712 }],
      ['an allowed port on every interface', { host_ip: '0.0.0.0', published: '4710', target: 80 }],
      ['an allowed port with no host IP', { published: '4711', target: 80 }],
      ['a random host port', { target: 3000 }],
    ])('rejects %s', (_name, port) => {
      expect(rulesBroken(modelWith({ ports: [port] }))).toEqual(['published-port']);
    });

    it.each(['1000', '1000:1000', '65534:65534'])('accepts the user %s', (user) => {
      expect(rulesBroken(modelWith({ user }))).toEqual([]);
    });

    it.each(['host', 'container:3f2a'])('rejects network_mode: %s', (mode) => {
      expect(rulesBroken(modelWith({ network_mode: mode }))).toEqual(['host-network']);
    });

    it('accepts network_mode: service:<name>, since that service is checked itself', () => {
      expect(rulesBroken(modelWith({ network_mode: 'service:gateway' }))).toEqual([]);
    });

    it.each([
      ['an external network named host', { name: 'host' }],
      ['a network with the host driver', { name: 'yoman_hostnet', driver: 'host' }],
    ])('rejects a service attached to %s', (_name, network) => {
      const model = {
        ...modelWith({ networks: { hn: null } }),
        networks: { hn: network },
      };

      expect(rulesBroken(model)).toEqual(['host-network']);
    });

    it('accepts a service on an internal bridge network', () => {
      const model = {
        ...modelWith({ networks: { internal: null } }),
        networks: { internal: { name: 'yoman_internal', driver: 'bridge' } },
      };

      expect(rulesBroken(model)).toEqual([]);
    });

    it.each([
      ['no user', undefined],
      ['root', 'root'],
      ['uid 0', '0'],
      ['uid 0 with a group', '0:1000'],
      ['an empty user name', ':1000'],
      ['a zero-padded uid 0', '00'],
      ['a signed uid 0', '+0'],
      ['a zero-padded uid 0 with group 0', '0000:0'],
      ['a non-root uid with group 0', '1000:0'],
      ['a named user, which may map to uid 0', 'app'],
      ['a uid with whitespace', ' 1000'],
    ])('rejects %s', (_name, user) => {
      const service = compliantService();
      delete service.user;
      const model = { services: { web: user === undefined ? service : { ...service, user } } };

      expect(rulesBroken(model)).toEqual(['non-root']);
    });

    it('rejects a service without read_only', () => {
      const service = compliantService();
      delete service.read_only;

      expect(rulesBroken({ services: { web: service } })).toEqual(['read-only']);
    });

    it('rejects read_only: false', () => {
      expect(rulesBroken(modelWith({ read_only: false }))).toEqual(['read-only']);
    });

    it('rejects a service that keeps some capabilities', () => {
      expect(rulesBroken(modelWith({ cap_drop: ['NET_RAW'] }))).toEqual(['cap-drop']);
    });

    it('rejects a service without no-new-privileges', () => {
      expect(rulesBroken(modelWith({ security_opt: ['label=type:container_t'] }))).toEqual([
        'no-new-privileges',
      ]);
    });

    it.each(['no-new-privileges', 'no-new-privileges:true', 'no-new-privileges=true'])(
      'accepts security_opt %s',
      (option) => {
        expect(rulesBroken(modelWith({ security_opt: [option] }))).toEqual([]);
      },
    );

    it.each([
      ['true then false', ['no-new-privileges:true', 'no-new-privileges:false']],
      ['false', ['no-new-privileges=false']],
      ['an unknown value', ['no-new-privileges:yes']],
    ])('rejects no-new-privileges set to %s, since the last entry wins', (_name, options) => {
      expect(rulesBroken(modelWith({ security_opt: options }))).toEqual(['no-new-privileges']);
    });

    it('accepts no-new-privileges when false is overridden by a later true', () => {
      const options = ['no-new-privileges:false', 'no-new-privileges:true'];

      expect(rulesBroken(modelWith({ security_opt: options }))).toEqual([]);
    });

    it('rejects added capabilities, even after cap_drop ALL', () => {
      expect(rulesBroken(modelWith({ cap_add: ['SYS_ADMIN', 'NET_ADMIN'] }))).toEqual(['cap-add']);
    });

    it('accepts an empty cap_add', () => {
      expect(rulesBroken(modelWith({ cap_add: [] }))).toEqual([]);
    });

    it.each([
      ['pid', { pid: 'host' }],
      ['ipc', { ipc: 'host' }],
      ['userns_mode', { userns_mode: 'host' }],
    ])('rejects %s: host', (_name, override) => {
      expect(rulesBroken(modelWith(override))).toEqual(['host-namespace']);
    });

    it('accepts a private ipc namespace', () => {
      expect(rulesBroken(modelWith({ ipc: 'private' }))).toEqual([]);
    });

    it('rejects mapped host devices', () => {
      const devices = [{ source: '/dev/mem', target: '/dev/mem', permissions: 'rwm' }];

      expect(rulesBroken(modelWith({ devices }))).toEqual(['devices']);
    });

    it.each([
      'seccomp:unconfined',
      'seccomp=unconfined',
      'apparmor:unconfined',
      'apparmor=unconfined',
    ])('rejects security_opt %s', (option) => {
      const model = modelWith({ security_opt: ['no-new-privileges:true', option] });

      expect(rulesBroken(model)).toEqual(['unconfined-profile']);
    });

    it('rejects a privileged service', () => {
      expect(rulesBroken(modelWith({ privileged: true }))).toEqual(['privileged']);
    });

    it('accepts a memory limit set under deploy instead of mem_limit', () => {
      const service = compliantService();
      delete service.mem_limit;
      const model = {
        services: {
          web: { ...service, deploy: { resources: { limits: { memory: MEMORY_BYTES } } } },
        },
      };

      expect(rulesBroken(model)).toEqual([]);
    });

    it.each([
      ['no memory limit', undefined],
      ['a zero memory limit', '0'],
      ['an unparsed memory limit', '128m'],
    ])('rejects %s', (_name, memLimit) => {
      const service = compliantService();
      delete service.mem_limit;
      const model = {
        services: { web: memLimit === undefined ? service : { ...service, mem_limit: memLimit } },
      };

      expect(rulesBroken(model)).toEqual(['memory-limit']);
    });

    it.each([
      '/var/run/docker.sock',
      '/run/docker.sock',
      '/run/user/1000/docker.sock',
      '/var/run',
      '/var/run/',
      '/run',
      '/',
      '/run/user/1000',
    ])('rejects a bind mount of %s', (source) => {
      const model = modelWith({ volumes: [{ type: 'bind', source, target: '/mnt' }] });

      expect(rulesBroken(model)).toEqual(['docker-socket']);
    });

    it.each(['/var/run', '/run', '/var/run/docker.sock'])(
      'rejects a named volume whose driver binds %s',
      (device) => {
        const model = {
          ...modelWith({ volumes: [{ type: 'volume', source: 'dockerrun', target: '/mnt' }] }),
          volumes: { dockerrun: { driver_opts: { type: 'none', o: 'bind', device } } },
        };

        expect(rulesBroken(model)).toEqual(['docker-socket']);
      },
    );

    it('accepts a named volume whose driver binds an ordinary directory', () => {
      const model = {
        ...modelWith({ volumes: [{ type: 'volume', source: 'backups', target: '/backups' }] }),
        volumes: { backups: { driver_opts: { type: 'none', o: 'bind', device: '/srv/backups' } } },
      };

      expect(rulesBroken(model)).toEqual([]);
    });

    it('accepts ordinary bind mounts and named volumes', () => {
      const model = modelWith({
        volumes: [
          { type: 'bind', source: '/home/user/yoman/backups', target: '/backups' },
          { type: 'volume', source: 'pgdata', target: '/var/lib/postgresql/data' },
        ],
      });

      expect(rulesBroken(model)).toEqual([]);
    });

    it.each(['nginx', 'nginx:1.27', 'nginx:latest', 'nginx@sha256:abc'])(
      'rejects the unpinned image %s',
      (image) => {
        expect(rulesBroken(modelWith({ image }))).toEqual(['image-digest']);
      },
    );

    it('accepts a service built from a local context without an image', () => {
      const service = compliantService();
      delete service.image;
      const build = {
        context: `${PROJECT}/services/gateway`,
        dockerfile: 'Dockerfile',
        additional_contexts: { shared: `${PROJECT}/packages/shared` },
      };

      expect(rulesBroken({ services: { web: { ...service, build } } })).toEqual([]);
    });

    it('accepts a built service whose image is pinned by digest', () => {
      const model = modelWith({ build: { context: PROJECT } });

      expect(rulesBroken(model)).toEqual([]);
    });

    it('rejects a built service whose image could be pulled unpinned', () => {
      const model = modelWith({ image: 'alpine:latest', build: { context: PROJECT } });

      expect(rulesBroken(model)).toEqual(['image-digest']);
    });

    it.each([
      ['a remote git context', { context: 'https://github.com/x/y.git#main' }],
      ['a git context without a scheme', { context: 'github.com/x/y' }],
      ['an SSH git context', { context: 'git@github.com:x/y.git' }],
      ['a context outside the project', { context: '/srv/other' }],
      ['a sibling directory with the same prefix', { context: '/srv/yoman-evil' }],
      ['an inline Dockerfile', { context: PROJECT, dockerfile_inline: 'FROM ubuntu:latest' }],
      ['a Dockerfile outside the project', { context: PROJECT, dockerfile: '/tmp/Dockerfile' }],
      [
        'an image as an additional context',
        { context: PROJECT, additional_contexts: { base: 'docker-image://alpine:latest' } },
      ],
    ])('rejects a build from %s', (_name, build) => {
      const service = compliantService();
      delete service.image;

      expect(rulesBroken({ services: { web: { ...service, build } } })).toEqual(['build-source']);
    });

    it('rejects a service with neither image nor build', () => {
      const service = compliantService();
      delete service.image;

      expect(rulesBroken({ services: { web: service } })).toEqual(['image-digest']);
    });

    it('reports every violation with its service name', () => {
      const model = { services: { db: { image: 'postgres:16' } } };

      const violations = checkComposePolicy(model, PROJECT);

      expect(violations.map(({ rule }) => rule)).toEqual([
        'non-root',
        'read-only',
        'cap-drop',
        'no-new-privileges',
        'memory-limit',
        'image-digest',
      ]);
      expect(
        violations.every(({ service, message }) => service === 'db' && message.startsWith('db ')),
      ).toBe(true);
    });
  });

  describe('compose files', { timeout: COMPOSE_TIMEOUT_MS }, () => {
    it('accepts the compliant fixture', async () => {
      const model = await loadFixture('valid.yml');

      expect(formatComposeViolations(checkComposePolicy(model, REPO_ROOT))).toBe('');
    });

    it('fails when a port is added', async () => {
      const model = await loadFixture('extra-port.yml');

      expect(rulesBroken(model, REPO_ROOT)).toEqual(['published-port']);
    });

    it('fails when read_only is removed', async () => {
      const model = await loadFixture('no-read-only.yml');

      expect(rulesBroken(model, REPO_ROOT)).toEqual(['read-only']);
    });

    it('includes the override file Compose merges on its own', async () => {
      const model = await loadComposeProject(fixture('project-with-override'));

      expect(rulesBroken(model, REPO_ROOT)).toEqual(['published-port', 'privileged']);
    });

    it('the repo Compose project follows the policy', async () => {
      const model = await loadComposeProject(REPO_ROOT);

      expect(formatComposeViolations(checkComposePolicy(model, REPO_ROOT))).toBe('');
    });
  });
});
