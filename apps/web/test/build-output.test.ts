import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const BUILD_TIMEOUT_MS = 60_000;

/**
 * The CSP allows only same-origin scripts (SECURITY A6), so an inline script in
 * the production build would be blocked and show up as a console error. Inline
 * styles are allowed for Emotion's runtime rules, but the shipped HTML needs
 * none, so it stays free of them too.
 */
describe('production build', { timeout: BUILD_TIMEOUT_MS }, () => {
  let outDir: string;
  let html: string;
  let scripts: string[];

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'yoman-web-build-'));
    // Vitest sets NODE_ENV=test, which Vite would treat as a dev build (DEV true,
    // mocks included). The image builds with NODE_ENV unset, so test that build.
    vi.stubEnv('NODE_ENV', undefined);
    try {
      await build({ root: WEB_DIR, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    } finally {
      vi.unstubAllEnvs();
    }
    html = await readFile(join(outDir, 'index.html'), 'utf8');
    const assets = await readdir(join(outDir, 'assets'));
    scripts = await Promise.all(
      assets
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(join(outDir, 'assets', file), 'utf8')),
    );
  }, BUILD_TIMEOUT_MS);

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('has no inline script: every <script> loads a same-origin file', () => {
    const tags = html.match(/<script\b[^>]*>/giu) ?? [];

    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).toMatch(/\ssrc="\/assets\/[^"]+\.js"/iu);
    }
    expect(html).not.toMatch(/<script\b[^>]*>[^<\s]/iu);
  });

  it('has no inline styles, event handlers or data: URLs', () => {
    expect(html).not.toMatch(/<style\b/iu);
    expect(html).not.toMatch(/\sstyle=/iu);
    expect(html).not.toMatch(/\son[a-z]+=/iu);
    expect(html).not.toContain('data:');
  });

  it('starts in Hebrew, right to left', () => {
    expect(html).toMatch(/<html lang="he" dir="rtl">/u);
  });

  it('leaves MSW out of the bundle', () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script).not.toContain('mockServiceWorker');
      expect(script).not.toContain('setupWorker');
    }
  });

  it('needs no eval, which the CSP forbids', () => {
    for (const script of scripts) {
      expect(script).not.toMatch(/\bnew Function\(|\beval\(/u);
    }
  });
});
