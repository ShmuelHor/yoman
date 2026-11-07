import { describe, expect, it } from 'vitest';

import {
  RootManifest,
  resolveWorkspaces,
  UnsupportedWorkspaceGlobError,
  type WorkspaceFileSystem,
} from './workspaces.js';

/** An in-memory file system built from a list of file paths. */
function fakeFileSystem(files: readonly string[]): WorkspaceFileSystem {
  return {
    listSubdirectories: (dir) => {
      const prefix = `${dir}/`;
      const children = files
        .filter((file) => file.startsWith(prefix) && file.slice(prefix.length).includes('/'))
        .map((file) => file.slice(prefix.length).split('/')[0] ?? '');
      return Promise.resolve([...new Set(children)]);
    },
    isFile: (path) => Promise.resolve(files.includes(path)),
  };
}

describe('resolveWorkspaces', () => {
  it('returns nothing when no directory matches', async () => {
    const fs = fakeFileSystem(['README.md']);

    await expect(resolveWorkspaces(['apps/*', 'services/*'], fs)).resolves.toEqual([]);
  });

  it('finds directories with a package.json, sorted', async () => {
    const fs = fakeFileSystem([
      'services/sessions/package.json',
      'apps/web/package.json',
      'apps/agent/package.json',
    ]);

    await expect(resolveWorkspaces(['apps/*', 'services/*'], fs)).resolves.toEqual([
      'apps/agent',
      'apps/web',
      'services/sessions',
    ]);
  });

  it('skips matching directories without a package.json', async () => {
    const fs = fakeFileSystem(['apps/web/package.json', 'apps/notes/README.md']);

    await expect(resolveWorkspaces(['apps/*'], fs)).resolves.toEqual(['apps/web']);
  });

  it('accepts a literal workspace path', async () => {
    const fs = fakeFileSystem(['tools/cli/package.json']);

    await expect(resolveWorkspaces(['tools/cli', 'tools/missing'], fs)).resolves.toEqual([
      'tools/cli',
    ]);
  });

  it('lists a workspace matched by two globs once', async () => {
    const fs = fakeFileSystem(['apps/web/package.json']);

    await expect(resolveWorkspaces(['apps/*', 'apps/web'], fs)).resolves.toEqual(['apps/web']);
  });

  it.each(['apps/**', '!apps/web', 'apps/{web,agent}', '../outside/*', 'apps/./web', '/abs/*'])(
    'rejects the unsupported glob %s',
    async (glob) => {
      const fs = fakeFileSystem([]);

      await expect(resolveWorkspaces([glob], fs)).rejects.toThrow(UnsupportedWorkspaceGlobError);
    },
  );

  it('reports the offending glob and a stable code', () => {
    const error = new UnsupportedWorkspaceGlobError('apps/**');

    expect(error).toMatchObject({ code: 'UNSUPPORTED_WORKSPACE_GLOB', glob: 'apps/**' });
  });
});

describe('RootManifest', () => {
  it('reads the workspaces and ignores other fields', () => {
    expect(RootManifest.parse({ name: 'yoman', workspaces: ['apps/*'] })).toEqual({
      workspaces: ['apps/*'],
    });
  });

  it('defaults to no workspaces', () => {
    expect(RootManifest.parse({ name: 'yoman' })).toEqual({ workspaces: [] });
  });

  it.each([{ workspaces: 'apps/*' }, { workspaces: [''] }, { workspaces: [1] }])(
    'rejects malformed workspaces %j',
    (manifest) => {
      expect(RootManifest.safeParse(manifest).success).toBe(false);
    },
  );
});
