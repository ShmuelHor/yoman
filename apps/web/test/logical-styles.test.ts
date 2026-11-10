import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const LINT_TIMEOUT_MS = 30_000;
/** Shared by both diagnostics of biome-plugins/no-physical-style-props.grit. */
const DIAGNOSTIC = 'do not flip with dir';

/**
 * Lints a throwaway style object inside `src/`, where `apps/web/biome.json` and
 * its Grit plugin apply, and returns Biome's exit code and output.
 */
async function lintStyle(
  members: string,
): Promise<{ readonly failed: boolean; readonly output: string }> {
  const file = join(SRC_DIR, `lint-probe-${randomUUID()}.ts`);
  await writeFile(file, `export const probe = { ${members} };\n`);
  try {
    const { stdout, stderr } = await run(
      'npx',
      ['--no', '--', 'biome', 'lint', '--error-on-warnings', file],
      { cwd: REPO_ROOT },
    );
    return { failed: false, output: `${stdout}${stderr}` };
  } catch (error: unknown) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    return { failed: true, output: `${stdout}${stderr}` };
  } finally {
    await rm(file, { force: true });
  }
}

/** Layouts must flip with `dir`, so physical styles are banned in the web app (SPEC §6). */
describe('logical style rule', { timeout: LINT_TIMEOUT_MS }, () => {
  it.each([
    'marginLeft: 1',
    'paddingRight: 1',
    'left: 0',
    'ml: 1',
    "'border-top-left-radius': 1",
    'borderTopLeftRadius: 1',
    "textAlign: 'left'",
    "float: 'right'",
  ])('rejects %s in a style object', async (member) => {
    const result = await lintStyle(member);

    expect(result.failed).toBe(true);
    expect(result.output).toContain(DIAGNOSTIC);
  });

  it('accepts logical properties and values', async () => {
    const result = await lintStyle(
      "marginInlineStart: 1, paddingBlockEnd: 1, insetInlineStart: 0, textAlign: 'start', leftover: 1",
    );

    expect(result).toMatchObject({ failed: false });
  });
});

/** Styles live in the MUI theme and in sx/styled, so there is no stylesheet to check. */
describe('web sources', () => {
  it('hold no hand-written CSS files', async () => {
    const entries = await readdir(SRC_DIR, { recursive: true });

    expect(entries.filter((entry) => entry.endsWith('.css'))).toEqual([]);
  });
});
