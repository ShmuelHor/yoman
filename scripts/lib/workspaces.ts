import { posix } from 'node:path';

import { z } from 'zod';

/** Upper bound on workspace globs; the repo uses three. */
const MAX_WORKSPACE_GLOBS = 32;
const MAX_GLOB_LENGTH = 200;

/**
 * A workspace glob we can expand without a glob library: a relative path inside
 * the repo, optionally ending in `/*`. `.` and `..` segments are not allowed.
 */
const SUPPORTED_GLOB = /^[\w.-]+(\/[\w.-]+)*(\/\*)?$/u;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)/u;
const WILDCARD_SUFFIX = '/*';
const MANIFEST_FILE = 'package.json';

/** The fields of the root `package.json` this tooling reads. Other fields are ignored. */
export const RootManifest = z.object({
  workspaces: z.array(z.string().min(1).max(MAX_GLOB_LENGTH)).max(MAX_WORKSPACE_GLOBS).default([]),
});
export type RootManifest = z.infer<typeof RootManifest>;

/** The file system queries workspace resolution needs, passed in so it can be tested in memory. */
export interface WorkspaceFileSystem {
  /** Names of the direct subdirectories of `dir`, or none when `dir` does not exist. */
  readonly listSubdirectories: (dir: string) => Promise<readonly string[]>;
  /** Whether `path` exists and is a regular file. */
  readonly isFile: (path: string) => Promise<boolean>;
}

/** Thrown when a `workspaces` entry uses glob syntax beyond `dir` or `dir/*`. */
export class UnsupportedWorkspaceGlobError extends Error {
  readonly code = 'UNSUPPORTED_WORKSPACE_GLOB';

  constructor(readonly glob: string) {
    super(`Unsupported workspace glob "${glob}": use "dir" or "dir/*".`);
    this.name = 'UnsupportedWorkspaceGlobError';
  }
}

async function candidateDirectories(glob: string, fs: WorkspaceFileSystem): Promise<string[]> {
  if (!SUPPORTED_GLOB.test(glob) || DOT_SEGMENT.test(glob)) {
    throw new UnsupportedWorkspaceGlobError(glob);
  }
  if (!glob.endsWith(WILDCARD_SUFFIX)) {
    return [glob];
  }
  const parent = glob.slice(0, -WILDCARD_SUFFIX.length);
  const children = await fs.listSubdirectories(parent);
  return children.map((child) => posix.join(parent, child)).sort();
}

/**
 * Expands the `workspaces` globs against the files on disk and returns every
 * matching directory that contains a `package.json`.
 *
 * Directories come in the order of their globs, sorted within each glob. That
 * order is the build order, so listing `packages/*` first builds the shared
 * packages before the services and apps that import their `dist/`.
 *
 * This reads the working tree rather than npm's installed tree, so a package
 * added since the last `npm install` is still found.
 */
export async function resolveWorkspaces(
  globs: readonly string[],
  fs: WorkspaceFileSystem,
): Promise<string[]> {
  const candidates = (
    await Promise.all(globs.map((glob) => candidateDirectories(glob, fs)))
  ).flat();
  const unique = [...new Set(candidates)];
  const withManifest = await Promise.all(
    unique.map(async (dir) => ((await fs.isFile(posix.join(dir, MANIFEST_FILE))) ? [dir] : [])),
  );
  return withManifest.flat();
}
