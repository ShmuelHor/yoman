import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WEB_SRC = fileURLToPath(new URL('../../apps/web/src/', import.meta.url));
/** The only ways React renders a string as markup instead of text. */
const RAW_HTML_SINKS = /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML/u;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return nested.flat().filter((file) => /\.tsx?$/u.test(file));
}

/**
 * The rendering half of ST13 (a hostile name becomes a text node, never an <img>) runs with the
 * page in `apps/web/test/pages/today/title-xss.test.tsx`, because it needs the web's DOM and JSX
 * setup. Playwright is not a dependency yet, so it uses happy-dom. This half guards the cause:
 * nothing in the web may reach a raw-HTML sink.
 */
describe('ST13 window title XSS', () => {
  it('no web source reaches a raw HTML sink', async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_SRC)) {
      if (RAW_HTML_SINKS.test(await readFile(file, 'utf8'))) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
