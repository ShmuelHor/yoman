# Yoman: security and privacy

Yoman collects highly sensitive data: what you were doing on your computer at every moment, window titles (document names, websites, conversations) and process lists.
**Assumption:** a leak of this data is as serious as a leak of your browser history. Every decision in the project is measured against this document.

**Principle:** security is enforced automatically in CI. A red check blocks the merge, and there is no `continue-on-error`. An exception is allowed only through a documented allowlist file that includes a reason and an expiry date.

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
| A6 | **XSS through a window title** (title = external input) | React escaping only, a lint rule banning `dangerouslySetInnerHTML`, CSP `default-src 'self'` with no inline | T11, T26 | ST07, ST13 |
| A7 | **Command injection in the muter** | `execFile` with an args array only. app-id validated against `^[a-zA-Z0-9._-]{1,128}$` | T34 | ST14 |
| A8 | **SQL injection** | Parameterized queries only. A lint rule banning template strings inside `query()` | T09 | ST12 |
| A9 | **A compromised service reads another service's data** | A DB user per service, with privileges on its own schema only. `REVOKE ALL ON SCHEMA public` | T10 | ST16 |
| A10 | **Container escape** | non-root, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `tmpfs: /tmp`, CPU and memory limits, no docker socket | T09, T10 | ST01, ST19 |
| A11 | **Sensitive data in logs** | pino redaction: `authorization`, `cookie`, `title`, `cmdline`, `token`, `password` | T09, T12 | ST11 |
| A12 | **Secrets in process command lines** | The agent sends only `comm`, never `cmdline` | T23 | ST17 |
| A13 | **Malicious dependency** (supply chain) | `npm ci`, `ignore-scripts=true`, audit, OSV, Dependabot, dependency-review, Actions pinned to a SHA, images pinned to a digest, SBOM and signing | T01, T04, T06 | ST19, CI |
| A14 | **An app stays muted after a crash** | Save state before every change and restore it on startup | T34 | T34 test |
| A15 | **docker socket = root privileges** | The agent does not require the `docker` group. Mapping via cgroup names. The socket is optional and off by default | T24 | ST01 |
| A16 | **Exposed backups and exports** | `backups/` in `.gitignore` and at `0600`. Export only with a session | T48 | ST03, ST15 |
| A17 | **API flooding** | Rate limit: ingest once per 10 s, web 300 requests per minute. 1MB body limit | T19 | ST09, ST10 |
| A18 | **Unexpected input crashes a service** | zod at every boundary. Fuzzing for every route | T19 | ST08 |
| A19 | **The CI/CD itself is compromised** | `contents: read` permissions by default, no `pull_request_target`, zizmor and actionlint, keyless signing with OIDC and no stored keys | T03–T06 | CI |

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
| ST08 | **Fuzzing:** for every route, 500 invalid inputs (fast-check from the zod schema) → always 400, never 500 | T19 + every route task |
| ST09 | Rate limit → 429 | T19 |
| ST10 | Body larger than 1MB → 413 | T19 |
| ST11 | **Redaction:** an injected token and title do not appear in the log output | T09, T12 |
| ST12 | SQL injection payloads in every parameter → no DB error and no leak | T13–T18 |
| ST13 | **XSS:** a title of `<img src=x onerror=…>` is rendered as text (Playwright) | T35 |
| ST14 | Muter: an app-id containing `;`, `$()` or a space is rejected, and `execFile` is called without a shell | T34 |
| ST15 | Permissions: `.env`, state and backups are created at `0600`/`0700` | T02, T12, T48 |
| ST16 | Least privilege: a service's DB user cannot read another service's schema | T10 |
| ST17 | The agent never sends `cmdline`, and does not send the title when the setting is off | T23, T47 |
| ST18 | **DAST:** OWASP ZAP baseline against a running compose. 0 findings at Medium or above | T52 |
| ST19 | **Image scanning:** Trivy, 0 fixable HIGH or CRITICAL findings | T06 |

## 4. CI security gates (blocking)
| Tool | What it checks | When |
|---|---|---|
| gitleaks | Secrets across the full history | Every PR, push and nightly |
| npm audit (`--audit-level=moderate`) + OSV-Scanner | Vulnerable dependencies | Every PR and nightly |
| dependency-review-action | A new dependency that is vulnerable or has a disallowed license (GPL/AGPL) | Every PR |
| CodeQL (javascript-typescript, security-extended) | Static code analysis | Every PR and weekly |
| Semgrep (`p/owasp-top-ten`, `p/nodejs`, `p/typescript`, `p/react`, `p/docker-compose` + local rules) | Dangerous patterns | Every PR |
| hadolint | Dockerfiles | Every PR |
| Trivy config + fs | Misconfiguration and dependencies | Every PR |
| Trivy image | Built images | Every PR, release and nightly |
| actionlint + zizmor | Security of the workflows themselves | Every PR |
| Biome (`biome ci`) + GritQL rules in `biome-plugins/` | `shell:true`, `dangerouslySetInnerHTML`, template SQL, `exec`, `eval`, `any` | Every PR |
| tests/security (ST01–ST17) | Actual behavior | Every PR |
| ZAP baseline (ST18) | DAST | Nightly and release |
| OpenSSF Scorecard | Repo health | Weekly |

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
- [ ] New dependency: justified in the PR, maintained, compatible license, and no install scripts
- [ ] The ST tests the task enables have gone from todo to real tests
- [ ] New files are created with the permissions from the table
