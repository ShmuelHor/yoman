import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WEB_DIR = fileURLToPath(new URL('../..', import.meta.url));
const SRC_DIR = join(WEB_DIR, 'src');
/** The single file allowed to hold color literals (docs/DESIGN.md). */
const TOKENS_FILE = 'src/theme/color-tokens.ts';
const SCANNED = /\.(css|ts|tsx|html)$/u;

/** `#abc`, `#abcd`, `#aabbcc` and `#aabbccdd`, plus the rgb()/hsl() color functions. */
const RAW_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?)\(/giu;

/** Returns every raw color literal in a source text. */
function rawColorsIn(source: string): string[] {
  return source.match(RAW_COLOR) ?? [];
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('raw color detection', () => {
  it.each([
    ['color: #fff;', ['#fff']],
    ['border-color: #B4532A;', ['#B4532A']],
    ["const ink = '#1e1c19cc';", ['#1e1c19cc']],
    ['color: rgb(0 0 0);', ['rgb(']],
    ['color: hsla(0, 0%, 0%, 0.5);', ['hsla(']],
  ])('finds the color in %s', (source, colors) => {
    expect(rawColorsIn(source)).toEqual(colors);
  });

  it.each(['color: var(--text);', "document.getElementById('root');", 'a[href="#main"] {}'])(
    'ignores %s',
    (source) => {
      expect(rawColorsIn(source)).toEqual([]);
    },
  );
});

/** Colors come only from tokens, so a theme change is one edit in one file (DESIGN.md). */
describe('web sources', () => {
  it(`hold no color literal outside ${TOKENS_FILE}`, async () => {
    const files = [...(await filesUnder(SRC_DIR)), join(WEB_DIR, 'index.html')];
    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(WEB_DIR, file);
      if (path === TOKENS_FILE) {
        continue;
      }
      for (const color of rawColorsIn(await readFile(file, 'utf8'))) {
        offenders.push(`${path}: ${color}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keep the tokens file where the check expects it', async () => {
    const tokens = await readFile(join(WEB_DIR, TOKENS_FILE), 'utf8');

    expect(rawColorsIn(tokens).length).toBeGreaterThan(0);
  });
});
