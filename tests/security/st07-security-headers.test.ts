import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const WEB_DIR = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const NGINX_DIR = join(WEB_DIR, 'nginx');

/** Pulling the image on a cold runner takes longer than Vitest's 5s default. */
const CONTAINER_TIMEOUT_MS = 120_000;
const READY_ATTEMPTS = 50;
const READY_DELAY_MS = 100;
const CONTAINER_PORT = '8080/tcp';
const OK = 200;
const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;
/** World-readable, so nginx (uid 101) can serve the fixture files. */
const READABLE_DIR = 0o755;
const READABLE_FILE = 0o644;

/** The nginx base image exactly as the web Dockerfile pins it. */
async function pinnedNginxImage(): Promise<string> {
  const dockerfile = await readFile(join(WEB_DIR, 'Dockerfile'), 'utf8');
  const image = /^FROM (nginxinc\/nginx-unprivileged[^\s@]*@sha256:[0-9a-f]{64})\s*$/mu.exec(
    dockerfile,
  )?.[1];
  if (image === undefined) {
    throw new Error('apps/web/Dockerfile must use nginxinc/nginx-unprivileged pinned by digest');
  }
  return image;
}

/** A stand-in for the Vite build: an app shell and one hashed asset. */
async function writeSite(dir: string): Promise<void> {
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><script src="/assets/app.js"></script>');
  await writeFile(join(dir, 'assets', 'app.js'), 'export {};\n');
  await chmod(dir, READABLE_DIR);
  await chmod(join(dir, 'assets'), READABLE_DIR);
  await chmod(join(dir, 'index.html'), READABLE_FILE);
  await chmod(join(dir, 'assets', 'app.js'), READABLE_FILE);
}

const mount = (source: string, target: string): string[] => [
  '--mount',
  `type=bind,source=${source},target=${target},readonly`,
];

async function waitUntilServing(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    try {
      await fetch(`${baseUrl}/healthz`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS));
    }
  }
  throw new Error(`nginx did not start serving at ${baseUrl}`);
}

/** CSP directives by name, each with its source list. */
function parseCsp(header: string | null): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of (header ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/u);
    if (name !== undefined && name !== '') {
      directives.set(name.toLowerCase(), sources);
    }
  }
  return directives;
}

describe('ST07 security headers', () => {
  describe('web (nginx config, served by the pinned image)', {
    timeout: CONTAINER_TIMEOUT_MS,
  }, () => {
    let site: string;
    let container: string | undefined;
    let baseUrl: string;

    beforeAll(async () => {
      site = await mkdtemp(join(tmpdir(), 'yoman-st07-'));
      await writeSite(site);
      // The same hardening as apps/web/compose.yml, so the config is proven to work under it.
      const { stdout } = await run('docker', [
        'run',
        '--detach',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--user',
        '101:101',
        '--publish',
        '127.0.0.1::8080',
        '--entrypoint',
        'nginx',
        ...mount(join(NGINX_DIR, 'nginx.conf'), '/etc/nginx/nginx.conf'),
        ...mount(join(NGINX_DIR, 'default.conf'), '/etc/nginx/conf.d/default.conf'),
        ...mount(
          join(NGINX_DIR, 'security-headers.conf'),
          '/etc/nginx/snippets/security-headers.conf',
        ),
        ...mount(site, '/usr/share/nginx/html'),
        await pinnedNginxImage(),
        '-g',
        'daemon off;',
      ]);
      container = stdout.trim();
      const { stdout: published } = await run('docker', ['port', container, CONTAINER_PORT]);
      const address = published.split('\n').find((line) => line.startsWith('127.0.0.1:'));
      if (address === undefined) {
        throw new Error(`nginx is not published on loopback: ${published}`);
      }
      baseUrl = `http://${address}`;
      await waitUntilServing(baseUrl);
    });

    afterAll(async () => {
      if (container !== undefined) {
        await run('docker', ['rm', '--force', container]);
      }
      await rm(site, { recursive: true, force: true });
    });

    const responses: readonly [string, string, string, number][] = [
      ['the app shell', 'GET', '/', OK],
      ['a client-side route', 'GET', '/week', OK],
      ['a hashed asset', 'GET', '/assets/app.js', OK],
      ['a missing asset', 'GET', '/assets/missing.js', NOT_FOUND],
      ['a write to a static server', 'POST', '/', METHOD_NOT_ALLOWED],
      ['the health check', 'GET', '/healthz', OK],
    ];

    it.each(responses)(
      'web sends CSP, X-Content-Type-Options, Referrer-Policy: no-referrer and frame-ancestors none on %s',
      async (_name, method, path, status) => {
        const response = await fetch(`${baseUrl}${path}`, { method });

        expect(response.status).toBe(status);
        const csp = parseCsp(response.headers.get('content-security-policy'));
        expect(csp.get('default-src')).toEqual(["'self'"]);
        expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      },
    );

    it('web CSP allows no inline code, eval, wildcards or data: URLs (SECURITY A6)', async () => {
      const response = await fetch(`${baseUrl}/`);
      const csp = parseCsp(response.headers.get('content-security-policy'));
      const sources = [...csp.values()].flat();

      for (const banned of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'data:']) {
        expect(sources).not.toContain(banned);
      }
      expect(csp.get('script-src')).toEqual(["'self'"]);
      expect(csp.get('style-src')).toEqual(["'self'"]);
      expect(csp.get('object-src')).toEqual(["'none'"]);
      expect(csp.get('base-uri')).toEqual(["'none'"]);
      // The page may call only itself and the loopback gateway.
      expect(csp.get('connect-src')).toEqual([
        "'self'",
        'http://127.0.0.1:4711',
        'http://localhost:4711',
      ]);
    });

    it('web does not reveal the nginx version', async () => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.headers.get('server')).toBe('nginx');
    });

    it('the web image ships exactly the tested config files', async () => {
      const dockerfile = await readFile(join(WEB_DIR, 'Dockerfile'), 'utf8');

      for (const line of [
        'COPY apps/web/nginx/nginx.conf /etc/nginx/nginx.conf',
        'COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf',
        'COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf',
      ]) {
        expect(dockerfile.split('\n')).toContain(line);
      }
    });
  });

  it.todo(
    '[T19] gateway sends CSP, X-Content-Type-Options, Referrer-Policy: no-referrer and frame-ancestors none',
  );
});
