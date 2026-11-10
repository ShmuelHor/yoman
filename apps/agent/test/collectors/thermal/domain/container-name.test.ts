import { describe, expect, it } from 'vitest';
import { parseContainerName } from '../../../../src/collectors/thermal/domain/container-name.js';

// Low-entropy container IDs, so no fixture looks like a token to gitleaks (ST02).
const ID = 'ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';
const OTHER_ID = 'cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34';
const SHORT_ID = 'ab12ab12ab12';
/** Past the 4 kB path and 32-line limits a real `/proc/<pid>/cgroup` stays within. */
const MAX_PATH_LENGTH = 4_096;
const MAX_LINES = 32;
const OVERSIZED_SEGMENT = 'a'.repeat(MAX_PATH_LENGTH);
const TOO_MANY_LINES = '1:cpu:/\n'.repeat(MAX_LINES);

describe('parseContainerName', () => {
  it('names a Docker container under the systemd cgroup driver by its short ID', () => {
    // Act / Assert
    expect(parseContainerName(`0::/system.slice/docker-${ID}.scope\n`)).toBe(`docker:${SHORT_ID}`);
  });

  it('names a Docker container under the cgroupfs driver', () => {
    // Act / Assert
    expect(parseContainerName(`0::/docker/${ID}\n`)).toBe(`docker:${SHORT_ID}`);
  });

  it('names a rootless Podman container', () => {
    // Arrange
    const text = `0::/user.slice/user-1000.slice/user@1000.service/user.slice/libpod-${ID}.scope/container\n`;

    // Act / Assert
    expect(parseContainerName(text)).toBe(`podman:${SHORT_ID}`);
  });

  it('does not take the Podman monitor process for the container', () => {
    // Act / Assert
    expect(parseContainerName(`0::/machine.slice/libpod-conmon-${ID}.scope\n`)).toBeUndefined();
  });

  it('names Kubernetes containers run by containerd and CRI-O', () => {
    // Arrange
    const pod = '/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod1.slice';

    // Act / Assert
    expect(parseContainerName(`0::${pod}/cri-containerd-${ID}.scope\n`)).toBe(
      `containerd:${SHORT_ID}`,
    );
    expect(parseContainerName(`0::${pod}/crio-${ID}.scope\n`)).toBe(`cri-o:${SHORT_ID}`);
  });

  it('names an LXC container by its name', () => {
    // Act / Assert
    expect(parseContainerName('0::/lxc.payload.web-01/system.slice\n')).toBe('lxc:web-01');
  });

  it('keeps the outermost container, which a process inside cannot rename', () => {
    // Arrange
    const nested = `0::/system.slice/docker-${ID}.scope/docker/${OTHER_ID}\n`;

    // Act / Assert
    expect(parseContainerName(nested)).toBe(`docker:${SHORT_ID}`);
  });

  it('finds the container on a cgroup v1 machine', () => {
    // Arrange
    const text = [
      '12:pids:/user.slice',
      `11:cpu,cpuacct:/docker/${ID}`,
      '1:name=systemd:/user.slice/user-1000.slice/session-2.scope',
      '0::/',
      '',
    ].join('\n');

    // Act / Assert
    expect(parseContainerName(text)).toBe(`docker:${SHORT_ID}`);
  });

  it('prefers the unified hierarchy when the hierarchies disagree', () => {
    // Arrange
    const text = `4:memory:/docker/${OTHER_ID}\n0::/system.slice/docker-${ID}.scope\n`;

    // Act / Assert
    expect(parseContainerName(text)).toBe(`docker:${SHORT_ID}`);
  });

  it.each([
    [
      'a desktop app',
      '0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-gnome-firefox-4242.scope\n',
    ],
    ['the Docker daemon itself', '0::/system.slice/docker.service\n'],
    [
      'a snap',
      '0::/user.slice/user-1000.slice/user@1000.service/app.slice/snap.code.code-1.scope\n',
    ],
    ['the root cgroup', '0::/\n'],
  ])('finds no container for %s', (_name, text) => {
    // Act / Assert
    expect(parseContainerName(text)).toBeUndefined();
  });

  it('ignores an ID that is not 64 hex digits', () => {
    // Act / Assert
    expect(parseContainerName(`0::/system.slice/docker-${SHORT_ID}.scope\n`)).toBeUndefined();
    expect(parseContainerName(`0::/docker/${ID.toUpperCase()}\n`)).toBeUndefined();
  });

  it.each([
    ['an empty file', ''],
    ['a line without a path', '0::\n'],
    ['a relative path', '0::docker/x\n'],
    ['a line that is not a cgroup line', `container=docker-${ID}.scope\n`],
    ['an oversized path', `0::/${OVERSIZED_SEGMENT}/docker-${ID}.scope\n`],
    ['too many lines', `${TOO_MANY_LINES}0::/docker/${ID}\n`],
  ])('rejects %s', (_name, text) => {
    // Act / Assert
    expect(parseContainerName(text)).toBeUndefined();
  });
});
