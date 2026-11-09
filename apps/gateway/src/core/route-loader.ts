import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  type AnyRouteHandler,
  HANDLED_ROUTE_NAMES,
  type HandledRouteName,
  type HandlerMap,
} from './route-handler.js';

export type ModuleImporter = (url: string) => Promise<unknown>;

export interface LoadRoutesOptions {
  /** `src/routes` (or `dist/routes`): one folder per domain, owned by its route task. */
  readonly dir: string;
  readonly importModule?: ModuleImporter;
}

/** Built code has `index.js`; Vitest and `tsx` run `index.ts`. */
const ENTRY_FILES = ['index.js', 'index.ts'];
const DOMAIN_NAME = /^[a-z][a-z0-9-]*$/;

const RouteModule = z.object({
  handlers: z.partialRecord(
    z.enum(HANDLED_ROUTE_NAMES),
    // Signatures cannot be checked at runtime; request parts are parsed before any call.
    z.custom<AnyRouteHandler>((value) => typeof value === 'function', 'must be a function'),
  ),
});

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function listEntries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error: unknown) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
}

async function findEntry(folder: string): Promise<string> {
  const files = await listEntries(folder);
  const entry = ENTRY_FILES.find((file) => files.includes(file));
  if (entry === undefined) {
    throw new Error(`route folder has no ${ENTRY_FILES.join(' or ')}: ${folder}`);
  }
  return join(folder, entry);
}

async function listDomains(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error: unknown) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Loads the handlers of every domain folder under `dir` (TASKS: each route task
 * owns `src/routes/<domain>/`). A missing `dir` means no handlers yet; a
 * malformed module, or two modules handling the same route, fails at startup.
 */
export async function loadRouteHandlers(options: LoadRoutesOptions): Promise<HandlerMap> {
  const importModule = options.importModule ?? ((url: string): Promise<unknown> => import(url));
  const handlers = new Map<HandledRouteName, AnyRouteHandler>();
  const owners = new Map<HandledRouteName, string>();
  for (const domain of await listDomains(options.dir)) {
    if (!DOMAIN_NAME.test(domain)) {
      throw new Error(`route folder name must be kebab-case: ${domain}`);
    }
    const entry = await findEntry(join(options.dir, domain));
    const parsed = RouteModule.safeParse(await importModule(pathToFileURL(entry).href));
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(module)');
      throw new Error(`route module ${domain} is invalid at: ${[...new Set(fields)].join(', ')}`);
    }
    for (const route of HANDLED_ROUTE_NAMES) {
      const handler = parsed.data.handlers[route];
      if (handler === undefined) {
        continue;
      }
      const owner = owners.get(route);
      if (owner !== undefined) {
        throw new Error(`route ${route} is handled by both ${owner} and ${domain}`);
      }
      owners.set(route, domain);
      handlers.set(route, handler);
    }
  }
  return handlers;
}
