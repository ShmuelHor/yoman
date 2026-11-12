import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KnownApp } from '@yoman/shared/focus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CloseWatch,
  WatchDir,
} from '../../../src/collectors/apps/adapters/applications-dirs.js';
import type { RunFile } from '../../../src/collectors/apps/adapters/gsettings.js';
import {
  type AppsCollector,
  type AppsCollectorOptions,
  createAppsCollector,
  SETTLE_MS,
} from '../../../src/collectors/apps/collector.js';
import type { CollectorContext } from '../../../src/core/plugin.js';
import {
  type SessionBus,
  SessionBusError,
  type SignalHandler,
  type SignalMatch,
} from '../../../src/core/session-bus.js';
import { recordedPresence, unreachableSessionBus } from '../../support/collector-context.js';
import { recordingLogger } from '../../support/logs.js';

/** The Done-when bound of T25: a new install is seen within 5 s. */
const DETECTION_BOUND_MS = 5_000;
const CHILDREN_KEY = '/org/gnome/desktop/notifications/application-children';

function desktopFile(name: string): string {
  return `[Desktop Entry]\nType=Application\nName=${name}\nExec=${name.toLowerCase()}\n`;
}

/** A dconf-service on the bus: `notify` fires `ca.desrt.dconf.Writer.Notify`. */
class FakeDconf implements SessionBus {
  readonly subscriptions: SignalMatch[] = [];
  unsubscribed = false;
  private handler: SignalHandler | undefined;

  call(): Promise<readonly unknown[]> {
    return Promise.resolve([]);
  }

  subscribe(match: SignalMatch, handler: SignalHandler): Promise<() => Promise<void>> {
    this.subscriptions.push(match);
    this.handler = handler;
    return Promise.resolve(() => {
      this.unsubscribed = true;
      return Promise.resolve();
    });
  }

  close(): void {
    this.unsubscribed = true;
  }

  notify(body: readonly unknown[]): void {
    this.handler?.(body);
  }
}

/** inotify under the test's control: `change(dir)` fires the directory's watch. */
class FakeInotify {
  readonly watched = new Map<string, { onChange: () => void; onError: (e: unknown) => void }>();
  readonly closed: string[] = [];

  readonly watch: WatchDir = (dir, onChange, onError): CloseWatch => {
    this.watched.set(dir, { onChange, onError });
    return (): void => {
      this.closed.push(dir);
    };
  };

  change(dir: string): void {
    this.watched.get(dir)?.onChange();
  }

  fail(dir: string, error: unknown): void {
    this.watched.get(dir)?.onError(error);
  }
}

/** gsettings that answers with `children`, and counts its runs. */
function fakeGsettings(children: () => string): RunFile & { runs: number } {
  const run = Object.assign(
    (): Promise<unknown> => {
      run.runs += 1;
      return Promise.resolve(children());
    },
    { runs: 0 },
  );
  return run;
}

function context(
  bus: SessionBus,
): CollectorContext & { logs: unknown[]; reported: (readonly KnownApp[])[] } {
  const { logger, logs } = recordingLogger();
  const reported: (readonly KnownApp[])[] = [];
  return {
    logs,
    reported,
    logger,
    sessionBus: bus,
    ...recordedPresence(),
    emit: (): Promise<void> => Promise.resolve(),
    reportKnownApps: (apps): void => {
      reported.push(apps);
    },
  };
}

/** Records every catalog the collector publishes; `next` waits for the following one. */
function catalogChanges(): {
  onChange: (apps: readonly KnownApp[]) => void;
  seen: (readonly KnownApp[])[];
  next: () => Promise<readonly KnownApp[]>;
} {
  const seen: (readonly KnownApp[])[] = [];
  let waiting: ((apps: readonly KnownApp[]) => void) | undefined;
  return {
    seen,
    onChange: (apps): void => {
      seen.push(apps);
      waiting?.(apps);
      waiting = undefined;
    },
    next: () =>
      new Promise((resolve) => {
        waiting = resolve;
      }),
  };
}

async function start(collector: AppsCollector, ctx: CollectorContext): Promise<void> {
  if (collector.start === undefined) {
    throw new Error('the apps collector is event-driven');
  }
  await collector.start(ctx);
}

describe('apps collector', () => {
  let root: string;
  let userDir: string;
  let systemDir: string;
  let inotify: FakeInotify;
  let dconf: FakeDconf;
  let children: string;
  let gsettings: RunFile & { runs: number };
  let changes: ReturnType<typeof catalogChanges>;
  let collector: AppsCollector;

  function create(overrides: Partial<AppsCollectorOptions> = {}): AppsCollector {
    collector = createAppsCollector({
      dirs: [userDir, systemDir, join(root, 'no-flatpak')],
      watch: inotify.watch,
      run: gsettings,
      onChange: changes.onChange,
      ...overrides,
    });
    return collector;
  }

  beforeEach(async () => {
    // Only timers are faked: the directories are real, so file IO must run.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    root = await mkdtemp(join(tmpdir(), 'yoman-apps-'));
    userDir = join(root, 'user');
    systemDir = join(root, 'system');
    await mkdir(userDir);
    await mkdir(systemDir);
    await writeFile(join(systemDir, 'org.gnome.Nautilus.desktop'), desktopFile('Files'));
    inotify = new FakeInotify();
    dconf = new FakeDconf();
    children = "['org-gnome-nautilus']";
    gsettings = fakeGsettings(() => children);
    changes = catalogChanges();
  });

  afterEach(async () => {
    await collector.stop?.();
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it('reports the catalog to the agent core on start', async () => {
    // Arrange
    const ctx = context(dconf);

    // Act
    await start(create(), ctx);

    // Assert
    expect(ctx.reported).toEqual([
      [{ appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' }],
    ]);
  });

  it('lists the installed apps on start, without polling', async () => {
    // Arrange
    const apps = create();
    const ctx = context(dconf);

    // Act
    await start(apps, ctx);

    // Assert
    expect(apps.knownApps()).toEqual([
      { appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' },
    ]);
    expect(changes.seen).toHaveLength(1);
    expect(apps.intervalMs).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ collector: 'apps', apps: 1, msg: 'app catalog loaded' }),
    );
    expect(ctx.logs).not.toContainEqual(expect.objectContaining({ msg: 'discovered new apps' }));
  });

  it('detects a newly installed app within 5 s', async () => {
    // Arrange
    const ctx = context(dconf);
    await start(create(), ctx);
    const installedAt = Date.now();
    const discovered = changes.next();

    // Act: apt writes the file, inotify reports it, and the burst settles.
    await writeFile(join(systemDir, 'slack.desktop'), desktopFile('Slack'));
    inotify.change(systemDir);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const apps = await discovered;

    // Assert
    expect(Date.now() - installedAt).toBeLessThanOrEqual(DETECTION_BOUND_MS);
    expect(apps).toContainEqual({ appId: 'slack', name: 'Slack', source: 'desktop' });
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ collector: 'apps', added: 1, msg: 'discovered new apps' }),
    );
  });

  it('detects a Chrome web app as an app of its own', async () => {
    // Arrange
    await writeFile(join(systemDir, 'google-chrome.desktop'), desktopFile('Google Chrome'));
    await start(create(), context(dconf));
    const discovered = changes.next();

    // Act
    await writeFile(
      join(userDir, 'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-Default.desktop'),
      desktopFile('YouTube Music'),
    );
    inotify.change(userDir);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const apps = await discovered;

    // Assert
    expect(apps.map((app) => app.appId)).toEqual([
      'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-default',
      'google-chrome',
      'org-gnome-nautilus',
    ]);
  });

  it('reads a directory once after a burst of changes', async () => {
    // Arrange
    await start(create(), context(dconf));

    // Act
    await writeFile(join(systemDir, 'slack.desktop'), desktopFile('Slack'));
    inotify.change(systemDir);
    await vi.advanceTimersByTimeAsync(SETTLE_MS / 2);
    await writeFile(join(systemDir, 'zoom.desktop'), desktopFile('Zoom'));
    inotify.change(systemDir);
    const discovered = changes.next();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await discovered;

    // Assert
    expect(changes.seen).toHaveLength(2);
    expect(changes.seen[1]?.map((app) => app.appId)).toEqual([
      'org-gnome-nautilus',
      'slack',
      'zoom',
    ]);
  });

  it('drops an uninstalled app', async () => {
    // Arrange
    children = '@as []';
    await writeFile(join(systemDir, 'slack.desktop'), desktopFile('Slack'));
    await start(create(), context(dconf));
    const updated = changes.next();

    // Act
    await unlink(join(systemDir, 'slack.desktop'));
    inotify.change(systemDir);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    // Assert
    expect(await updated).toEqual([
      { appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' },
    ]);
  });

  it('picks up an app GNOME saw notify for the first time', async () => {
    // Arrange
    await start(create(), context(dconf));
    const discovered = changes.next();

    // Act
    children = "['org-gnome-nautilus', 'teams-for-linux']";
    dconf.notify([CHILDREN_KEY, [''], 'tag']);
    const apps = await discovered;

    // Assert
    expect(apps).toContainEqual({ appId: 'teams-for-linux', name: null, source: 'gsettings' });
    expect(dconf.subscriptions).toEqual([
      expect.objectContaining({ sender: 'ca.desrt.dconf', member: 'Notify' }),
    ]);
  });

  it('ignores dconf changes to other keys and malformed signals', async () => {
    // Arrange
    await start(create(), context(dconf));
    const runsAfterStart = gsettings.runs;

    // Act
    dconf.notify(['/org/gnome/desktop/interface/clock-format', [''], 'tag']);
    dconf.notify(['not', 'a', 'change']);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    // Assert
    expect(gsettings.runs).toBe(runsAfterStart);
  });

  it('keeps listing desktop apps when gsettings and the session bus are missing', async () => {
    // Arrange
    const missing = Object.assign(new Error('spawn gsettings ENOENT'), { code: 'ENOENT' });
    const ctx = context(unreachableSessionBus());
    const apps = create({ run: () => Promise.reject(missing) });

    // Act
    await start(apps, ctx);

    // Assert
    expect(apps.knownApps()).toEqual([
      { appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' },
    ]);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ code: 'UNAVAILABLE', msg: 'new notifying apps are not followed' }),
    );
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({
        reason: 'ENOENT',
        msg: 'notification settings are unavailable, is this GNOME?',
      }),
    );
  });

  it('warns once on an unexpected gsettings payload and keeps the desktop apps', async () => {
    // Arrange
    children = 'No such schema';
    const ctx = context(dconf);
    const apps = create();

    // Act
    await start(apps, ctx);

    // Assert
    expect(apps.knownApps()).toHaveLength(1);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ msg: 'gsettings replied with an unexpected payload' }),
    );
  });

  it('skips a directory that cannot be watched and reports one that stops', async () => {
    // Arrange
    const missingDir = join(root, 'no-flatpak');
    const watch: WatchDir = (dir, onChange, onError) => {
      if (dir === missingDir) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return inotify.watch(dir, onChange, onError);
    };
    const ctx = context(dconf);
    await start(create({ watch }), ctx);

    // Act
    inotify.fail(userDir, Object.assign(new Error('gone'), { code: 'ENOENT' }));

    // Assert
    expect([...inotify.watched.keys()]).toEqual([userDir, systemDir]);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({
        reason: 'ENOENT',
        msg: 'stopped watching an applications directory',
      }),
    );
    expect(ctx.logs).not.toContainEqual(
      expect.objectContaining({ msg: 'an applications directory cannot be watched' }),
    );
  });

  it('never logs app names', async () => {
    // Arrange
    const ctx = context(dconf);
    await start(create(), ctx);
    const discovered = changes.next();

    // Act
    await writeFile(join(systemDir, 'secret.desktop'), desktopFile('Secret Project'));
    inotify.change(systemDir);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    await discovered;

    // Assert
    expect(JSON.stringify(ctx.logs)).not.toContain('Secret Project');
  });

  it('stops watching, unsubscribes and drops a pending read on stop', async () => {
    // Arrange
    const apps = create();
    await start(apps, context(dconf));
    await writeFile(join(systemDir, 'slack.desktop'), desktopFile('Slack'));
    inotify.change(systemDir);

    // Act
    await apps.stop?.();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    // Assert
    expect(inotify.closed).toEqual([userDir, systemDir, join(root, 'no-flatpak')]);
    expect(dconf.unsubscribed).toBe(true);
    expect(changes.seen).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails startup only on a bug, not on a missing session bus', async () => {
    // Arrange
    const broken: SessionBus = {
      call: () => Promise.reject(new SessionBusError('UNAVAILABLE', 'down')),
      subscribe: () => Promise.reject(new TypeError('bug')),
      close: () => undefined,
    };

    // Act
    const result = start(create(), context(broken));

    // Assert
    await expect(result).rejects.toThrow('bug');
  });
});
