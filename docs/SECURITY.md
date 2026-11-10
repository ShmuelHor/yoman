# Yoman: security and privacy

Yoman collects highly sensitive data: what you were doing on your computer at every moment, window titles (document names, websites, conversations) and process lists.

**Two goals, and only these two:**
1. **Your data never leaves the machine.** Nothing is published beyond loopback, and no container has a route to the internet.
2. **No secrets reach GitHub or anywhere else.** Tokens, passwords and real data never enter git, logs or build artifacts.

Remote takeover of the machine is out of scope. Anything that does not serve one of these goals is not gated here.

**Principle:** the gates are automated in CI. A red check blocks the merge, and there is no `continue-on-error`.

## 1. Assets
| Asset | Sensitivity |
|---|---|
| Window history and titles | **Very high** |
| Process lists | High (command lines can contain tokens) |
| `AGENT_TOKEN`, DB passwords | High |
| GNOME mute settings | Medium (tampering = missed notifications) |
| Battery and load data | Low |

## 2. Threats and mitigations

| # | Threat | Mitigation | Task | Test |
|---|---|---|---|---|
| A1 | **Secrets reach GitHub** | `.env*` in `.gitignore`, and pre-commit always blocks staged `.env*` files except `.env.example`. gitleaks runs in pre-commit when installed (best-effort locally) and in CI over the full history, where it is the enforcing gate. `npm run setup` generates random values. Only placeholders in `.env.example` | T02, T04 | ST02 |
| A2 | **API exposed to the local network** | Ports bound to `127.0.0.1` only. Internal services on an `internal: true` network | T10 | ST01 |
| A3 | **A malicious website sends requests to localhost** (CSRF) | `HttpOnly; SameSite=Strict` cookie, a CSRF token on every state-changing request, `Origin` check, CORS for 4710 only | T19 | ST05, ST06 |
| A4 | **DNS rebinding** | `Host` allowlist: only `127.0.0.1:4711` and `localhost:4711`, otherwise 421 | T19 | ST04 |
| A5 | **A local process impersonates the agent** | Bearer `AGENT_TOKEN` (32 bytes), `.env` at `0600`, comparison with `timingSafeEqual` | T02, T19 | ST03, ST15 |
| A6 | **XSS through a window title** (title = external input) | React escaping only, a lint rule banning `dangerouslySetInnerHTML`, CSP `script-src 'self'` with no inline script | T11, T26 | ST07, ST13 |
| A7 | **Command injection in the muter** | `execFile` with an args array only. app-id validated against `^[a-zA-Z0-9._-]{1,128}$` | T34 | ST14 |
| A8 | **SQL injection** | Parameterized queries only. A lint rule banning template strings inside `query()` | T09 | ST12 |
| A9 | **A compromised service reads another service's data** | A DB user per service, with privileges on its own schema only. `REVOKE ALL ON SCHEMA public` | T10 | ST16 |
| A10 | **Container escape and egress** | non-root, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `tmpfs: /tmp`, memory limits, no docker socket. Every service except web and gateway is only on `internal: true` networks, so no container can send data to the internet | T09, T10 | ST01, ST18 |
| A11 | **Sensitive data in logs** | pino redaction: `authorization`, `cookie`, `title`, `cmdline`, `token`, `password` | T09, T12 | ST11 |
| A12 | **Secrets in process command lines** | The agent sends only `comm`, never `cmdline` | T23 | ST17 |
| A13 | **Malicious dependency** (supply chain) | `npm ci`, `ignore-scripts=true`, npm audit, Dependabot, dependency-review, only popular and maintained packages, Actions pinned to a SHA, images pinned to a digest | T01, T04, T06 | CI |
| A14 | **An app stays muted after a crash** | Save state before every change and restore it on startup | T34 | T34 test |
| A15 | **docker socket = root privileges** | The agent does not require the `docker` group. Mapping via cgroup names. The socket is optional and off by default | T24 | ST01 |
| A16 | **Exposed backups and exports** | `backups/` in `.gitignore` and at `0600`. Export only with a session | T48 | ST03, ST15 |
| A17 | **API flooding** | Rate limit: ingest once per 10 s, web 300 requests per minute. 1MB body limit | T19 | ST09, ST10 |
| A18 | **Unexpected input crashes a service** | zod at every boundary. Fuzzing for every route | T19 | ST08 |
| A19 | **The CI/CD itself is compromised** | `contents: read` permissions by default, no `pull_request_target`, actionlint, SHA-pinned actions, no stored keys | T03–T06 | CI |

### Content Security Policy (web)
The web container (`apps/web/nginx/security-headers.conf`) sends this policy on every response, errors included. ST07 checks it.

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self';
connect-src 'self' http://127.0.0.1:4711 http://localhost:4711;
object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```

| Directive | Why |
|---|---|
| `default-src`, `script-src`, `img-src`, `font-src` `'self'` | Same-origin files only. No inline script and no `eval`, so an injected title cannot run (A6) |
| `style-src 'self' 'unsafe-inline'` | The UI is built on MUI, whose Emotion engine injects `<style>` rules at runtime, and a static nginx server cannot hand out a per-response nonce. Inline style cannot run code, `script-src` is unchanged, and React still escapes every title, so a title cannot inject markup to style in the first place (A6) |
| `connect-src 'self' http://127.0.0.1:4711 http://localhost:4711` | The page talks only to the gateway on loopback, under the two host names the gateway's `Host` allowlist accepts (A4) |
| `object-src 'none'`, `base-uri 'none'` | No plugins, and no `<base>` tag that could redirect relative URLs |
| `form-action 'self'` | Forms submit only to the web origin |
| `frame-ancestors 'none'` | No framing, so no clickjacking (with `X-Frame-Options: DENY` for older browsers) |

The other web headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` and a `Permissions-Policy` that turns off camera, microphone, geolocation, payment and USB. Any change to the policy updates this section in the same PR.

### Content Security Policy (gateway)
The gateway (`apps/gateway/src/core/security-headers.ts`) serves only JSON, so its policy allows nothing. A response that a browser is tricked into rendering as a page can load and run nothing. It is sent on every response, errors included, and ST07 checks it.

```
default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

The other gateway headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` and `Cache-Control: no-store`, because responses carry personal activity data. They come from `@fastify/helmet`: its defaults stay on except where the options in `security-headers.ts` replace them. `Strict-Transport-Security` is disabled on purpose, because the gateway speaks plain HTTP on loopback and HSTS would pin `localhost` for other apps. In development only, the OpenAPI docs under `/docs` get their own relaxed CSP (Swagger UI needs inline styles and scripts); the production gateway does not register them. Any change to the policy updates this section in the same PR.

## 3. Automated security tests (`tests/security/`)

Task T05 creates every test as `it.todo` with the ID of the responsible task.
**Every task listed in the "Enabled by" column must turn the todo into a real test in the same PR.**
CD fails if a single todo remains (`npm run security:todo`). That way no test can be forgotten.

| # | Test | Enabled by |
|---|---|---|
| ST01 | **Compose policy:** only 2 ports, both on 127.0.0.1. Every service is non-root, read_only, cap_drop ALL, no-new-privileges and has a memory limit. No docker.sock mount. Images pinned to a digest | T05 (active from the start) |
| ST02 | Secrets: gitleaks clean, `.env` not tracked by git, `.env.example` contains only placeholders | T05 (active from the start) |
| ST03 | **Authentication:** every route in the contracts' route map, without a token or session → 401. Derived automatically, so a new route is covered on its own | T19 |
| ST04 | Foreign Host → 421 | T19 |
| ST05 | State-changing request without CSRF or with a foreign Origin → 403 | T19 |
| ST06 | CORS: a foreign origin does not receive `Access-Control-Allow-Origin` | T19 |
| ST07 | Headers: CSP, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` on web and gateway | T11, T19 |
| ST08 | **Fuzzing:** for every route, 50 invalid inputs (fast-check from the zod schema) → always 400, never 500 | T19 + every route task |
| ST09 | Rate limit → 429 | T19 |
| ST10 | Body larger than 1MB → 413 | T19 |
| ST11 | **Redaction:** an injected token and title do not appear in the log output | T09, T12 |
| ST12 | SQL injection payloads in every parameter → no DB error and no leak | T13–T18 |
| ST13 | **XSS:** a title of `<img src=x onerror=…>` is rendered as text (Playwright) | T35 |
| ST14 | Muter: an app-id containing `;`, `$()` or a space is rejected, and `execFile` is called without a shell | T34 |
| ST15 | Permissions: `.env`, state and backups are created at `0600`/`0700` | T02, T12, T48 |
| ST16 | Least privilege: a service's DB user cannot read another service's schema | T10 |
| ST17 | The agent never sends `cmdline`, and does not send the title when the setting is off | T23, T47 |
| ST18 | **No container egress:** every compose service except web and gateway is attached only to `internal: true` networks, and web and gateway have at most one non-internal network (needed for loopback publishing) | T10 |

## 4. CI security gates (blocking)
| Tool | What it checks | When |
|---|---|---|
| gitleaks | Secrets across the full history and the tracked files (goal 2) | Every PR, push and nightly |
| npm audit (`--audit-level=moderate`) | Vulnerable dependencies | Every PR and nightly |
| dependency-review-action | A new dependency that is vulnerable or has a disallowed license (GPL/AGPL) | Every PR |
| CodeQL (javascript-typescript, security-extended) | Static code analysis | Every PR and weekly |
| actionlint | Mistakes in the workflows themselves | Every PR |
| Biome (`biome ci`) + GritQL rules in `biome-plugins/` | `shell:true`, `dangerouslySetInnerHTML`, template SQL, `exec`, `eval`, `any` | Every PR |
| tests/security (ST01–ST18) | Actual behavior, including the compose policy and no container egress (goal 1) | Every PR |

## 5. File permissions
| Path | Permission |
|---|---|
| `.env` | `0600` |
| `~/.config/yoman/` | `0700` |
| `~/.local/state/yoman/` | `0700`, files at `0600` |
| `backups/` | `0700`, files at `0600` |

## 6. Checklist for every PR
- [ ] Every external input is validated with zod at the boundary (route or collector)
- [ ] No secrets, titles or tokens in logs or error messages
- [ ] No `shell: true` and no command built from a string
- [ ] SQL with parameters only
- [ ] No new port, and no change to CORS, Host or CSP without updating this document
- [ ] New dependency: justified in the PR, popular and maintained, with a compatible license
- [ ] The ST tests the task enables have gone from todo to real tests
- [ ] New files are created with the permissions from the table
