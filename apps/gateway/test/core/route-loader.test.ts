import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadRouteHandlers, type ModuleImporter } from '../../src/core/route-loader.js';

const noop = (): Promise<unknown> => Promise.resolve(undefined);

describe('loadRouteHandlers', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-routes-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function domain(name: string, file = 'index.ts'): Promise<string> {
    await mkdir(join(dir, name));
    const path = join(dir, name, file);
    await writeFile(path, '');
    return pathToFileURL(path).href;
  }

  function importer(modules: Record<string, unknown>): ModuleImporter {
    return (url) => Promise.resolve(modules[url]);
  }

  it('treats a missing routes directory as no handlers', async () => {
    const handlers = await loadRouteHandlers({ dir: join(dir, 'missing') });

    expect(handlers.size).toBe(0);
  });

  it('collects the handlers of every domain folder', async () => {
    const battery = await domain('battery');
    const focus = await domain('focus', 'index.js');
    const modules = {
      [battery]: { handlers: { batteryNow: noop } },
      [focus]: { handlers: { focusStart: noop, focusStop: noop } },
    };

    const handlers = await loadRouteHandlers({ dir, importModule: importer(modules) });

    expect([...handlers.keys()].sort()).toEqual(['batteryNow', 'focusStart', 'focusStop']);
    expect(handlers.get('batteryNow')).toBe(noop);
  });

  it('ignores plain files next to the domain folders', async () => {
    await writeFile(join(dir, 'README.md'), '');

    const handlers = await loadRouteHandlers({ dir, importModule: importer({}) });

    expect(handlers.size).toBe(0);
  });

  it('really imports a module from disk', async () => {
    await mkdir(join(dir, 'week'));
    await writeFile(
      join(dir, 'week', 'index.js'),
      'export const handlers = { week: async () => ({}) };\n',
    );

    const handlers = await loadRouteHandlers({ dir });

    expect([...handlers.keys()]).toEqual(['week']);
  });

  it('rejects a folder without an entry file', async () => {
    await mkdir(join(dir, 'battery'));

    await expect(loadRouteHandlers({ dir, importModule: importer({}) })).rejects.toThrow(
      /route folder has no index\.js or index\.ts/,
    );
  });

  it('rejects a folder name that is not kebab-case', async () => {
    await domain('Battery');

    await expect(loadRouteHandlers({ dir, importModule: importer({}) })).rejects.toThrow(
      'route folder name must be kebab-case: Battery',
    );
  });

  it.each([
    ['no handlers export', {}],
    ['an unknown route', { handlers: { batteryLater: noop } }],
    ['the core session route', { handlers: { session: noop } }],
    ['a handler that is not a function', { handlers: { batteryNow: 'nope' } }],
  ])('rejects a module with %s', async (_name, module) => {
    const url = await domain('battery');

    await expect(
      loadRouteHandlers({ dir, importModule: importer({ [url]: module }) }),
    ).rejects.toThrow(/route module battery is invalid at: /);
  });

  it('rejects two modules that handle the same route', async () => {
    const battery = await domain('battery');
    const power = await domain('power');
    const modules = {
      [battery]: { handlers: { batteryNow: noop } },
      [power]: { handlers: { batteryNow: noop } },
    };

    await expect(loadRouteHandlers({ dir, importModule: importer(modules) })).rejects.toThrow(
      'route batteryNow is handled by both battery and power',
    );
  });
});
