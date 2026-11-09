import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type Actuator,
  type CollectorContext,
  type Plugin,
  type PluginContext,
  type PluginKind,
  PluginName,
  validatePlugin,
} from './plugin.js';
import type { Scheduler } from './scheduler.js';

export type Registry<K extends PluginKind> = ReadonlyMap<string, Extract<Plugin, { kind: K }>>;

export type ModuleImporter = (url: string) => Promise<unknown>;

export interface LoadOptions<K extends PluginKind> {
  /** `src/collectors` or `src/actuators`: one folder per plugin. */
  readonly dir: string;
  readonly kind: K;
  readonly importModule?: ModuleImporter;
}

/** Built code has `index.js`; `tsx` in development runs `index.ts`. */
const ENTRY_FILES = ['index.js', 'index.ts'];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findEntry(folder: string): Promise<string> {
  for (const file of ENTRY_FILES) {
    const path = join(folder, file);
    if (await exists(path)) {
      return path;
    }
  }
  throw new Error(`plugin folder has no ${ENTRY_FILES.join(' or ')}: ${folder}`);
}

function pluginExport(module: unknown): unknown {
  return typeof module === 'object' && module !== null && 'plugin' in module
    ? module.plugin
    : undefined;
}

/**
 * Loads every plugin folder under `dir`. Each folder's entry must export a
 * named `plugin` whose name matches the folder. A missing `dir` is an empty
 * registry; anything malformed fails loudly at startup.
 */
export async function loadRegistry<K extends PluginKind>(
  options: LoadOptions<K>,
): Promise<Registry<K>> {
  const importModule = options.importModule ?? ((url: string): Promise<unknown> => import(url));
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(options.dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
  const registry = new Map<string, Extract<Plugin, { kind: K }>>();
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const folder of folders.sort()) {
    if (!PluginName.safeParse(folder).success) {
      throw new Error(`plugin folder name must be kebab-case: ${folder}`);
    }
    const entry = await findEntry(join(options.dir, folder));
    const plugin = validatePlugin(
      options.kind,
      pluginExport(await importModule(pathToFileURL(entry).href)),
    );
    if (plugin.name !== folder) {
      throw new Error(`plugin name ${plugin.name} does not match its folder ${folder}`);
    }
    registry.set(folder, plugin);
  }
  return registry;
}

/**
 * Schedules every polling collector; each tick's samples go to `context.emit`.
 * Nothing is collected or buffered while the screen is locked (SPEC §4.1):
 * a tick that finds it locked pauses the scheduler, which covers a lock
 * reported before the scheduler started, and samples read just before a lock
 * are dropped.
 */
export function scheduleCollectors(
  scheduler: Scheduler,
  collectors: Registry<'collector'>,
  context: CollectorContext,
): void {
  for (const collector of collectors.values()) {
    const { intervalMs, collect } = collector;
    if (intervalMs !== undefined && collect !== undefined) {
      scheduler.every(collector.name, intervalMs, async () => {
        if (context.presence.locked) {
          scheduler.pause();
          return;
        }
        const samples = await collect.call(collector, context);
        if (!context.presence.locked) {
          await context.emit(samples);
        }
      });
    }
  }
}

/** Starts event-driven and stateful plugins, in name order. */
export async function startPlugins(
  plugins: Iterable<Plugin>,
  context: CollectorContext,
): Promise<void> {
  for (const plugin of plugins) {
    await plugin.start?.(context);
  }
}

/** Stops every plugin, even if one fails, and reports the failures. */
export async function stopPlugins(
  plugins: Iterable<Plugin>,
  onError: (name: string, error: unknown) => void,
): Promise<void> {
  for (const plugin of plugins) {
    try {
      await plugin.stop?.();
    } catch (error: unknown) {
      onError(plugin.name, error);
    }
  }
}

/**
 * Runs an actuator with an untrusted input. The input is validated against
 * the actuator's own schema first; errors name fields only, never values.
 */
export async function runActuator(
  actuators: Registry<'actuator'>,
  name: string,
  input: unknown,
  context: PluginContext,
): Promise<void> {
  const actuator: Actuator | undefined = actuators.get(name);
  if (actuator === undefined) {
    throw new Error(`unknown actuator: ${PluginName.safeParse(name).success ? name : '(invalid)'}`);
  }
  const result = actuator.input.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.map(String).join('.') || '(root)');
    throw new Error(`invalid input for ${name} at: ${[...new Set(fields)].join(', ')}`);
  }
  await actuator.run(result.data, context);
}
