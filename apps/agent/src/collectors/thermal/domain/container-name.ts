import { Label } from '@yoman/shared/common';
import { z } from 'zod';

/**
 * The kernel limits a cgroup path to `PATH_MAX`; v1 machines list about a
 * dozen hierarchies. Anything beyond is not a real `/proc/<pid>/cgroup`.
 */
const MAX_PATH_LENGTH = 4_096;
const MAX_LINES = 32;

/** `hierarchy-ID:controllers:path`, from cgroups(7). */
const CgroupLine = z
  .string()
  .regex(/^\d{1,4}:[\w,=]{0,256}:\/[^\n]*$/)
  .transform((line) => ({
    unified: line.startsWith('0::'),
    path: line.slice(line.indexOf(':/') + 1),
  }))
  .refine((line) => line.path.length <= MAX_PATH_LENGTH);

const CgroupFile = z
  .string()
  .transform((text) => text.split('\n').filter((line) => line !== ''))
  .pipe(z.array(CgroupLine).min(1).max(MAX_LINES));

/** Docker, Podman, containerd and CRI-O name a container by its 64-digit hex ID. */
const CONTAINER_ID = '([0-9a-f]{64})';
/** `docker ps` and `podman ps` show the first 12 digits. */
const SHORT_ID_LENGTH = 12;

interface ContainerPattern {
  readonly runtime: string;
  /** Matched against one path segment; the first group is the container ID or name. */
  readonly segment: RegExp;
  /** The segment before it must be this, for runtimes without a unit name. */
  readonly parent?: string;
  readonly shorten: boolean;
}

/**
 * How each runtime names a container's cgroup, under the systemd driver
 * (`docker-<id>.scope`) and the cgroupfs driver (`/docker/<id>`). Podman's
 * `libpod-conmon-<id>` is the monitor process, not the container, and does
 * not match.
 */
const CONTAINER_PATTERNS: readonly ContainerPattern[] = [
  { runtime: 'docker', segment: new RegExp(`^docker-${CONTAINER_ID}\\.scope$`), shorten: true },
  { runtime: 'docker', segment: new RegExp(`^${CONTAINER_ID}$`), parent: 'docker', shorten: true },
  {
    runtime: 'podman',
    segment: new RegExp(`^libpod-${CONTAINER_ID}(?:\\.scope)?$`),
    shorten: true,
  },
  {
    runtime: 'containerd',
    segment: new RegExp(`^cri-containerd-${CONTAINER_ID}\\.scope$`),
    shorten: true,
  },
  { runtime: 'cri-o', segment: new RegExp(`^crio-${CONTAINER_ID}\\.scope$`), shorten: true },
  {
    runtime: 'lxc',
    segment: /^lxc\.payload\.([A-Za-z0-9][A-Za-z0-9_.-]{0,63})$/,
    shorten: false,
  },
];

function matchSegment(segment: string, parent: string | undefined): string | undefined {
  for (const pattern of CONTAINER_PATTERNS) {
    if (pattern.parent !== undefined && pattern.parent !== parent) {
      continue;
    }
    const id = pattern.segment.exec(segment)?.[1];
    if (id !== undefined) {
      return `${pattern.runtime}:${pattern.shorten ? id.slice(0, SHORT_ID_LENGTH) : id}`;
    }
  }
  return undefined;
}

/**
 * The outermost container in a cgroup path. A process may create cgroups
 * below its own (nested containers, or delegation), but it cannot rename
 * the ones above it, so the outermost match is the one the host started.
 */
function containerInPath(path: string): string | undefined {
  const segments = path.split('/');
  for (const [index, segment] of segments.entries()) {
    const name = matchSegment(segment, segments[index - 1]);
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}

/**
 * The container a process runs in, from its `/proc/<pid>/cgroup`, as
 * `<runtime>:<short id>` (`docker:0123456789ab`), or `lxc:<name>`. No
 * runtime socket is asked (SECURITY A15), so Docker and Podman containers
 * are named by the short ID their `ps` command shows. The unified (v2)
 * hierarchy is checked first. Returns `undefined` for a process outside any
 * container, and for a malformed file.
 */
export function parseContainerName(text: string): string | undefined {
  const result = CgroupFile.safeParse(text);
  if (!result.success) {
    return undefined;
  }
  const lines = [...result.data].sort((a, b) => Number(b.unified) - Number(a.unified));
  for (const line of lines) {
    const name = containerInPath(line.path);
    if (name !== undefined) {
      return Label.parse(name);
    }
  }
  return undefined;
}
