import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const LINT_TIMEOUT_MS = 30_000;

/**
 * Lints a throwaway CSS file inside `src/`, where `apps/web/biome.json` applies,
 * and returns Biome's exit code and output.
 */
async function lintCss(
  css: string,
): Promise<{ readonly failed: boolean; readonly output: string }> {
  const file = join(SRC_DIR, `lint-probe-${randomUUID()}.css`);
  await writeFile(file, css);
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

/** Layouts must flip with `dir`, so physical CSS is banned in the web app (SPEC §6). */
describe('logical CSS rule', { timeout: LINT_TIMEOUT_MS }, () => {
  it.each([
    'margin-left: 1px;',
    'padding-right: 1px;',
    'left: 0;',
    'border-top-left-radius: 1px;',
    'text-align: left;',
    'float: right;',
  ])('rejects %s', async (declaration) => {
    const result = await lintCss(`.a {\n  ${declaration}\n}\n`);

    expect(result.failed).toBe(true);
    expect(result.output).toContain('useLogicalProperties');
  });

  it('accepts logical properties', async () => {
    const css =
      '.a {\n  margin-inline-start: 1px;\n  padding-block-end: 1px;\n  inset-inline-start: 0;\n  text-align: start;\n}\n';

    await expect(lintCss(css)).resolves.toMatchObject({ failed: false });
  });
});
