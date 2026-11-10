import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applicationsDirs,
  readApplicationsDir,
  watchDir,
} from '../../../../src/collectors/apps/adapters/applications-dirs.js';
import { MAX_DESKTOP_FILE_BYTES } from '../../../../src/collectors/apps/domain/desktop-entry.js';

const SLACK = '[Desktop Entry]\nType=Application\nName=Slack\n';

describe('applicationsDirs', () => {
  it('lists the user, flatpak, apt and snap directories in XDG precedence order', () => {
    // Act
    const dirs = applicationsDirs({ HOME: '/home/user' });

    // Assert
    expect(dirs).toEqual([
      '/home/user/.local/share/applications',
      '/home/user/.local/share/flatpak/exports/share/applications',
      '/var/lib/flatpak/exports/share/applications',
      '/usr/local/share/applications',
      '/usr/share/applications',
      '/var/lib/snapd/desktop/applications',
    ]);
  });

  it('follows XDG_DATA_HOME when it is absolute', () => {
    // Act
    const [user] = applicationsDirs({ HOME: '/home/user', XDG_DATA_HOME: '/data' });

    // Assert
    expect(user).toBe('/data/applications');
  });

  it('ignores a relative XDG_DATA_HOME', () => {
    // Act
    const [user] = applicationsDirs({ HOME: '/home/user', XDG_DATA_HOME: 'data' });

    // Assert
    expect(user).toBe('/home/user/.local/share/applications');
  });

  it('refuses to guess without an absolute HOME', () => {
    // Act
    const act = (): string[] => applicationsDirs({ HOME: 'relative' });

    // Assert
    expect(act).toThrow('HOME must be set to an absolute path');
  });
});

describe('readApplicationsDir', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-apps-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads every .desktop file, keyed by desktop file ID', async () => {
    // Arrange
    await writeFile(join(dir, 'slack.desktop'), SLACK);
    await writeFile(join(dir, 'notes.txt'), SLACK);

    // Act
    const listing = await readApplicationsDir(dir);

    // Assert
    expect(listing).toEqual(new Map([['slack.desktop', { status: 'app', name: 'Slack' }]]));
  });

  it('follows symlinks, as flatpak exports are', async () => {
    // Arrange
    await writeFile(join(dir, 'target'), SLACK);
    await symlink(join(dir, 'target'), join(dir, 'com.slack.Slack.desktop'));

    // Act
    const listing = await readApplicationsDir(dir);

    // Assert
    expect(listing?.get('com.slack.Slack.desktop')).toEqual({ status: 'app', name: 'Slack' });
  });

  it('masks what is not a readable regular file', async () => {
    // Arrange
    await mkdir(join(dir, 'folder.desktop'));
    await symlink(join(dir, 'missing'), join(dir, 'dangling.desktop'));

    // Act
    const listing = await readApplicationsDir(dir);

    // Assert
    expect(listing).toEqual(
      new Map([
        ['dangling.desktop', { status: 'masked' }],
        ['folder.desktop', { status: 'masked' }],
      ]),
    );
  });

  it('masks an oversized file without loading it whole', async () => {
    // Arrange
    await writeFile(join(dir, 'big.desktop'), SLACK + 'x'.repeat(MAX_DESKTOP_FILE_BYTES));

    // Act
    const listing = await readApplicationsDir(dir);

    // Assert
    expect(listing?.get('big.desktop')).toEqual({ status: 'masked' });
  });

  it('returns undefined for a directory that does not exist', async () => {
    // Act
    const listing = await readApplicationsDir(join(dir, 'missing'));

    // Assert
    expect(listing).toBeUndefined();
  });
});

describe('watchDir', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-apps-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports a new file through inotify', async () => {
    // Arrange
    let close = (): void => undefined;
    const changed = new Promise<void>((resolve, reject) => {
      close = watchDir(dir, resolve, reject);
    });

    // Act
    await writeFile(join(dir, 'slack.desktop'), SLACK);

    // Assert
    await expect(changed).resolves.toBeUndefined();
    close();
  });

  it('throws for a directory that does not exist', () => {
    // Act
    const act = (): unknown =>
      watchDir(
        join(dir, 'missing'),
        () => undefined,
        () => undefined,
      );

    // Assert
    expect(act).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });
});
