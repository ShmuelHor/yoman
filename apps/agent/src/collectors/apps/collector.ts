import type { KnownApp } from '@yoman/shared/focus';
import type { Collector, CollectorContext } from '../../core/plugin.js';
import { SessionBusError, type Unsubscribe } from '../../core/session-bus.js';
import {
  type ApplicationsEnv,
  applicationsDirs,
  type CloseWatch,
  readApplicationsDir,
  type WatchDir,
  watchDir,
} from './adapters/applications-dirs.js';
import {
  type RunFile,
  readApplicationChildren,
  runFile,
  subscribeDconfChanges,
} from './adapters/gsettings.js';
import { parseApplicationChildren } from './domain/application-children.js';
import { touchesApplicationChildren } from './domain/dconf-change.js';
import { buildKnownApps, type DirectoryListing, newApps } from './domain/known-apps.js';
import type { NotificationId } from './domain/notification-id.js';

export const APPS_COLLECTOR_NAME = 'apps';
/**
 * An install writes several files in a burst (apt, snap and flatpak all do),
 * so a directory is read once it has been quiet this long. Well inside the
 * 5 s a new app must be seen within.
 */
export const SETTLE_MS = 1_000;

export interface AppsCollectorOptions {
  /** The applications directories, in XDG precedence order. */
  readonly dirs?: readonly string[];
  readonly env?: ApplicationsEnv;
  readonly watch?: WatchDir;
  readonly run?: RunFile;
  /** Called with the whole catalog each time it changes, the first scan included. */
  readonly onChange?: (apps: readonly KnownApp[]) => void;
}

/** A collector whose catalog the core can read, to report it to focus (SPEC §5). */
export interface AppsCollector extends Collector {
  knownApps(): readonly KnownApp[];
}

/**
 * Discovers installed apps for focus mode (SPEC §4.1). Event-driven: inotify
 * on the applications directories and the dconf change signal for apps
 * GNOME saw notify. It neither polls nor emits samples; the catalog is
 * read through `knownApps` and `onChange`.
 */
export function createAppsCollector(options: AppsCollectorOptions = {}): AppsCollector {
  const watch = options.watch ?? watchDir;
  const run = options.run ?? runFile;
  const listings = new Map<string, DirectoryListing>();
  const closers: CloseWatch[] = [];
  const settleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Bumped on every read of a directory, so an older read finishing late is dropped. */
  const generations = new Map<string, number>();
  let dirs: readonly string[] = [];
  let children: readonly NotificationId[] = [];
  let catalog: readonly KnownApp[] = [];
  let unsubscribe: Unsubscribe | undefined;
  let context: CollectorContext | undefined;
  let running = false;
  /** Set once the first scan is in, so changes during it are published as part of it. */
  let loaded = false;

  function buildCatalog(): KnownApp[] {
    return buildKnownApps(
      dirs.flatMap((dir) => listings.get(dir) ?? []),
      children,
    );
  }

  function publish(): void {
    if (!running || !loaded) {
      return;
    }
    const next = buildCatalog();
    const added = newApps(catalog, next);
    // Removals and renames count too; the catalog is small, so comparing it whole is cheap.
    const changed = JSON.stringify(next) !== JSON.stringify(catalog);
    catalog = next;
    if (!changed) {
      return;
    }
    if (added.length > 0) {
      context?.logger.info(
        { collector: APPS_COLLECTOR_NAME, added: added.length },
        'discovered new apps',
      );
    }
    announce();
  }

  /** Tells the agent core to report the catalog, and the caller that asked to know. */
  function announce(): void {
    context?.reportKnownApps(catalog);
    options.onChange?.(catalog);
  }

  async function readDir(dir: string): Promise<void> {
    const generation = (generations.get(dir) ?? 0) + 1;
    generations.set(dir, generation);
    const listing = await readApplicationsDir(dir);
    if (!running || generations.get(dir) !== generation) {
      return;
    }
    if (listing === undefined) {
      listings.delete(dir);
    } else {
      listings.set(dir, listing);
    }
  }

  /** One unreadable directory (`EACCES`) must not hide the apps in the others. */
  async function readDirSafely(dir: string): Promise<void> {
    try {
      await readDir(dir);
    } catch (error: unknown) {
      warn({ reason: errorCode(error) }, 'an applications directory could not be read');
    }
  }

  function warn(fields: object, message: string): void {
    context?.logger.warn({ collector: APPS_COLLECTOR_NAME, ...fields }, message);
  }

  function rescanLater(dir: string): void {
    clearTimeout(settleTimers.get(dir));
    settleTimers.set(
      dir,
      setTimeout(() => {
        settleTimers.delete(dir);
        readDirSafely(dir).then(publish, (error: unknown) => {
          warn({ reason: errorCode(error) }, 'the app catalog could not be updated');
        });
      }, SETTLE_MS),
    );
  }

  /** Watches every directory that exists; one created later (a first flatpak) is not. */
  function watchAll(): void {
    for (const dir of dirs) {
      try {
        closers.push(
          watch(
            dir,
            () => {
              rescanLater(dir);
            },
            (error) => {
              warn({ reason: errorCode(error) }, 'stopped watching an applications directory');
            },
          ),
        );
      } catch (error: unknown) {
        if (errorCode(error) !== 'ENOENT') {
          warn({ reason: errorCode(error) }, 'an applications directory cannot be watched');
        }
      }
    }
  }

  async function readChildren(): Promise<void> {
    let stdout: unknown;
    try {
      stdout = await readApplicationChildren(run);
    } catch (error: unknown) {
      warn({ reason: errorCode(error) }, 'notification settings are unavailable, is this GNOME?');
      return;
    }
    const parsed = parseApplicationChildren(stdout);
    if (parsed === undefined) {
      warn({}, 'gsettings replied with an unexpected payload');
      return;
    }
    if (running) {
      children = parsed;
    }
  }

  async function followNotificationSettings(ctx: CollectorContext): Promise<void> {
    try {
      unsubscribe = await subscribeDconfChanges(ctx.sessionBus, (body) => {
        const relevant = touchesApplicationChildren(body);
        if (relevant === true) {
          readChildren().then(publish, (error: unknown) => {
            warn({ reason: errorCode(error) }, 'notification settings could not be read');
          });
        }
      });
    } catch (error: unknown) {
      if (!(error instanceof SessionBusError)) {
        throw error;
      }
      warn({ code: error.code, reason: error.message }, 'new notifying apps are not followed');
    }
  }

  return {
    kind: 'collector',
    name: APPS_COLLECTOR_NAME,
    knownApps: (): readonly KnownApp[] => catalog,
    async start(ctx): Promise<void> {
      context = ctx;
      running = true;
      dirs = options.dirs ?? applicationsDirs(options.env ?? process.env);
      // Watch before reading, so an install between the two is not missed.
      await followNotificationSettings(ctx);
      watchAll();
      await Promise.all([...dirs.map(readDirSafely), readChildren()]);
      catalog = buildCatalog();
      loaded = true;
      ctx.logger.info(
        { collector: APPS_COLLECTOR_NAME, apps: catalog.length },
        'app catalog loaded',
      );
      announce();
    },
    async stop(): Promise<void> {
      running = false;
      loaded = false;
      for (const timer of settleTimers.values()) {
        clearTimeout(timer);
      }
      settleTimers.clear();
      for (const close of closers.splice(0)) {
        close();
      }
      const active = unsubscribe;
      unsubscribe = undefined;
      await active?.();
    },
  };
}

/** Error codes (`ENOENT`, `EACCES`) are safe to log; messages may hold paths. */
function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'unknown';
}
