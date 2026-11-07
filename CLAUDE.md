# Yoman: agent rules

Local-only time tracker, battery and system monitor, and focus mode for Linux (GNOME Wayland).
Read before any task: `docs/TASKS.md` (work queue and parallel rules), `docs/SPEC.md` (what), `docs/SECURITY.md` (threats and required tests), `docs/DESIGN.md` (look).

## Roles
- **Coordinator** (main session): assigns tasks, merges PRs, runs wave gates. The only one who edits `docs/TASKS.md`.
- **Worker** (one per task): works in its own git worktree and branch, touches only the files the task owns, and opens one PR.
- **Reviewer** (separate agent): reviews every PR for correctness, the SECURITY.md §6 checklist, and every "גמור כש" item. Nothing merges without it.

## Worker workflow
1. Check the task's wave gate has passed and its dependencies are merged. Branch from fresh `main`: `t13-sessions-service`.
2. Stay inside the task's **ownership** paths. If you need to change anything else (especially `packages/shared`), stop and tell the coordinator. Contract changes ship as their own small PR first.
3. Commit like a careful human developer:
   - Small logical commits, usually 3–8 per task. Each one does one thing, builds, and passes tests.
   - Conventional Commits in English: `feat(sessions): merge consecutive samples into sessions`. Types: feat, fix, test, refactor, docs, chore, ci, build, security.
   - The body explains *why* when it isn't obvious. No `WIP`, no chains of "fix typo". Amend before pushing.
   - Never commit generated output, data, backups or anything from `.env`.
4. Before opening the PR: `npm run check && npm test && npm run test:security` pass locally, and every ST test the task enables (see SECURITY.md §3) is now a real test, not `it.todo`.
5. Open a PR using the template: what and why, how it was tested, security checklist, enabled ST tests. Merge is rebase-only, after green CI and reviewer approval.
6. If the spec is unclear or wrong, stop and ask. Don't invent behavior. Spec changes go in `docs/SPEC.md` in the same PR, called out in the description.

## Security rules (blocking)
- **Secrets:** never commit `.env`, tokens, passwords or real data. Only placeholders in `.env.example`. Never bypass or weaken gitleaks, CI security jobs or branch protection. No `continue-on-error`, and no new `.trivyignore` or `.semgrepignore` entries without a reason and an expiry date.
- **Network:** only `127.0.0.1:4710` (web) and `127.0.0.1:4711` (gateway) are published. Internal services stay on the internal network. Don't touch the Host, Origin, CORS or CSP rules without updating SECURITY.md.
- **Input:** validate every external input with zod at the boundary (route, collector, D-Bus payload). Window titles are untrusted input.
- **Execution:** `execFile` with an args array only. Never `shell: true`, never build a command from a string.
- **SQL:** parameterized queries only. Each service uses its own DB role and schema.
- **Logs:** never log titles, cmdlines, tokens, cookies or passwords. Use the pino redaction in service-kit or agent core.
- **Agent:** send process `comm` only, never `cmdline`. Never require the `docker` group. Save GNOME settings before changing them, and make them restorable after a crash. Never touch system apps.
- **Files:** `.env` and state files `0600`, their directories `0700`.
- **Dependencies:** justify every new one in the PR. It must be maintained, permissively licensed, and have no install scripts. Pin Actions to a SHA and images to a digest.
- **Containers:** non-root, read-only rootfs, `cap_drop: [ALL]`, `no-new-privileges`, memory limits. No docker.sock mounts.

## Language
- **All code is English:** identifiers, comments, log messages, error messages, commit messages, PR descriptions, `README.md` and code-level docs.
- Hebrew is allowed only in translation files (`**/i18n/he/**`, `**/i18n/he.json`) and in `docs/` planning documents. `npm run check` runs `scripts/check-language.ts`, which fails on Hebrew anywhere else.

## Code quality standard
This repo is a portfolio piece. Code should read like it was written by a strong senior engineer.
- **TypeScript:** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride`. No `any`, no non-null `!`, and no `as` casts except at validated boundaries. Exported functions have explicit return types.
- **Structure:** every service splits into `domain/` (pure logic, no IO, fully unit-tested), `adapters/` (DB, HTTP clients, D-Bus, filesystem) and `routes/` (thin: validate, call domain, map result). Dependencies are passed in, not imported as singletons, so everything is testable.
- **Errors:** typed error classes with stable codes. Never swallow errors. Only routes turn errors into HTTP responses, and never leak internals or stack traces.
- **Naming and files:** kebab-case file names, one concept per file, named exports only (no default exports), and no barrel files that re-export everything.
- **Functions:** small and single-purpose, with early returns and no deep nesting. No magic numbers: name constants.
- **Comments:** explain *why*, not *what*. TSDoc on exported APIs. No commented-out code, and no `TODO` without a task ID (`// TODO(T45): …`).
- **No `console.*`:** use the pino logger. Log structured fields, not string interpolation.
- **Tests:** Arrange/Act/Assert, descriptive names (`it('closes the session after a 15s gap')`), no sleeps (use fake timers), and no network. Test behavior, not implementation.
- **Consistency beats cleverness:** follow the existing patterns in the repo. If a pattern is wrong, fix it everywhere in its own PR.

## Product rules
- **Boundaries:** web and agent talk only to the gateway. Services never call each other and never read another service's schema. The gateway orchestrates and owns only `gateway.settings`.
- **Battery budget:** the agent stays ≤ 0.5% CPU and ≤ 60MB RSS. No new polling without updating SPEC §4.1. Everything pauses while the screen is locked.
- **Design:** colors, fonts, radii and spacing come only from `web/src/theme/tokens.css`. No hex values elsewhere, no gradients or shadows.
- **i18n:** every user-facing string goes in both `he` and `en` (Hebrew is the default). CSS uses logical properties only. Dates and numbers go through `Intl`.

## Stack
Node 22 + TypeScript (strict) · npm workspaces · Fastify · zod · pino · PostgreSQL 16 (node-pg-migrate) · vitest · fast-check · Playwright · React 18 + Vite + TanStack Query + react-i18next + MSW · dbus-next (agent) · Docker Engine + Compose v2 · GitHub Actions · cosign · syft · Trivy · Semgrep · CodeQL · gitleaks · ZAP.

## Commands
```
npm run setup            # create .env with random secrets (0600, safe to re-run)
docker compose up -d     # gateway, services, postgres, web
npm run agent:dev        # run the agent in the foreground
npm run check            # lint + typecheck
npm test                 # unit tests with coverage thresholds
npm run test:security    # tests/security (ST01–ST19)
npm run security:todo    # list ST tests not enabled yet (--strict fails)
```
