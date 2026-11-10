# Yoman: agent rules

Local-only time tracker, battery and system monitor, and focus mode for Linux (GNOME Wayland).
Read before any task: `docs/TASKS.md` (work queue and parallel rules), `docs/SPEC.md` (what), `docs/SECURITY.md` (threats and required tests), `docs/DESIGN.md` (look).

## Roles
Roles are separated, and each non-coordinator role is a project agent in `.claude/agents/` with its own instructions and tool set.

| Role | Definition | Tools | Does | Never |
| --- | --- | --- | --- | --- |
| **Coordinator** | main session | all | Moves cards on the [roadmap board](https://github.com/users/ShmuelHor/projects/3), launches workers and reviewers, merges, runs wave gates, owns `docs/` and `CLAUDE.md` | Implements task code |
| **Worker** | `task-worker` | Read, Edit, Write, Bash, Grep, Glob | One task per branch and worktree, small commits, one PR, answers review | Reviews or merges its own PR, rewrites pushed history |
| **Code reviewer** | `code-reviewer` | Read, Grep, Glob, Bash | Runs the branch, tries to break it, inline comments, `Verdict:` | Edits, commits, pushes or merges |
| **Security reviewer** | `security-reviewer` | Read, Grep, Glob, Bash | A second review on PRs labeled `security`, attacking against SECURITY.md | Edits, commits, pushes or merges |

Every PR gets a code review; PRs labeled `security` also get a security review, and both must end in `Verdict: approved`. Reviewers start from a clean context and are never the PR's worker. `.claude/settings.json` denies force pushes, `--no-verify` and reading `.env` for everyone.

### Board flow
`Todo` → **`Ready`** (all "Blocked by" issues closed; the coordinator moves it) → `In progress` (a worker took it) → `In review` (PR open) → `Done` (merged; `Closes #N` closes the issue).

## Git flow: branch → PR → code review → merge
Nobody commits to `main` directly. Every change, including docs and CI, goes through a branch and a PR on GitHub.

### Worker
1. Check the task's wave gate has passed and its dependencies are merged. Branch from fresh `main`: `git switch -c t13-sessions-service origin/main`. Branch names are `t<id>-<short-kebab-summary>`, or `fix/<summary>` and `chore/<summary>` for work outside the task list.
2. Stay inside the task's **ownership** paths. If you need to change anything else (especially `packages/shared`), stop and tell the coordinator. Contract changes ship as their own small PR first.
3. Commit like a careful human developer:
   - Small logical commits, usually 3–8 per task. Each one does one thing, builds, and passes tests.
   - Conventional Commits in English: `feat(sessions): merge consecutive samples into sessions`. Types: feat, fix, test, refactor, perf, docs, chore, ci, build, security, revert.
   - The body explains *why* when it isn't obvious. No `WIP`, no chains of "fix typo". Amend before the first push.
   - Never commit generated output, data, backups or anything from `.env`.
4. Before opening the PR: `npm run check && npm test && npm run test:security` pass locally, and every ST test the task enables (see SECURITY.md §3) is now a real test, not `it.todo`.
5. Push and open the PR: `git push -u origin <branch>`, then `gh pr create --base main --title "<conventional title>" --body-file <filled template>`. The title is `T13: sessions service` style. The body follows `.github/pull_request_template.md` in full: what and why, how it was tested, security checklist, enabled ST tests and new dependencies. Open it as a draft while CI is still running.
6. Address the review: answer **every** comment, either with a fix commit (`fix(sessions): handle out-of-order samples`) or a reasoned reply. After the first push, never rewrite history (no amend, no force push), so the reviewer can see what changed. Re-request review when done.
7. If the spec is unclear or wrong, stop and ask. Don't invent behavior. Spec changes go in `docs/SPEC.md` in the same PR, called out in the description.

### Shared state between worktrees
- **Git hooks are shared** by every worktree (`.git/hooks`). Workers never run `npm run hooks:install`; the coordinator installs hooks from the main clone after a merge.
- **Proving a gate fails** (a deliberately red commit) happens on a separate throwaway branch and draft PR that is closed unmerged, never on the task's PR, because every commit on `main` must pass. Link the red run in the task's PR and quote the key error lines, since logs expire.

### Reviewer (code review)
1. Read the task in `docs/TASKS.md`, then the full diff: `gh pr diff <n>`. Run the branch locally and run the checks yourself. Don't trust the description.
2. Review against: every "Done when" item of the task, the SECURITY.md §6 checklist, the code quality standard below, file ownership, test quality, and whether the PR does exactly what the task asks (no more, no less).
3. Leave **inline comments** on specific lines (`gh api repos/{owner}/{repo}/pulls/<n>/comments`), each labeled `blocking:`, `suggestion:` or `question:`. Blocking means a bug, a security issue, a missing requirement, or a standard violation.
4. Finish with a review summary (`gh pr review <n> --comment --body …`) that ends with a verdict line: `Verdict: changes requested` or `Verdict: approved`. GitHub doesn't let an account approve its own PR, so this verdict line is the approval record.
5. Re-review only what changed since the last round, until there are no blocking comments left.

### Coordinator (merge)
Merge only when CI is green, the latest review says `Verdict: approved`, and every review thread is resolved.
- **Rebase merge** (`gh pr merge <n> --rebase --delete-branch`) when every commit on the branch is clean.
- **Squash merge** with a proper Conventional Commit message and `Closes #N` when the branch carries commits that must not reach `main`: deliberately red probes, fixtures a secret scanner flags, or merge commits from updating the branch. The PR keeps the full history.

### Review budget
- One full review per PR (plus a security review only for security-critical areas: gateway, agent muter and collectors, CD). Only `blocking:` findings are fixed before merge; suggestions go into a follow-up issue.
- After fixes, a **lean re-review** of only the fix commits records the `Verdict: approved`. Use a cheaper model for reviews and routine tasks. Then tick the task in `docs/TASKS.md` through its own small `chore(tasks)` PR, batched per wave, and run the wave gate once the whole wave is merged.

### Coordinator sessions
- Coordinators and every agent talk to the user only in Hebrew. Everything in the repo stays English (see Language).
- Each wave runs in a fresh coordinator session. When a wave's gate passes and the user approves the next wave, the coordinator starts a new session with a short brief (board state, open PRs, budget rules) and hands off instead of running the next wave itself.
- Check plan usage (`get_usage`) before starting any agent, review or task. At 80% or more of the plan usage limit (the 5-hour or weekly window, not a session's context window), start nothing new: let running agents finish, then stop and tell the user the usage, the reset time and exactly where to resume.

## Security rules (blocking)
- **Secrets:** never commit `.env`, tokens, passwords or real data. Only placeholders in `.env.example`. Never bypass or weaken gitleaks, CI security jobs or branch protection. No `continue-on-error`, and no new `.trivyignore` or `.semgrepignore` entries without a reason and an expiry date.
- **Network:** only `127.0.0.1:4710` (web) and `127.0.0.1:4711` (gateway) are published. Internal services stay on the internal network. Don't touch the Host, Origin, CORS or CSP rules without updating SECURITY.md.
- **Input:** validate every external input with Zod at the boundary. Window titles are untrusted input.

## Validation with Zod
Zod is the only validation library in the repo.
- **Parse at every boundary:** env and config files, HTTP requests and responses (gateway and services), service-to-gateway replies, D-Bus payloads, `/proc` and `/sys` reads, `JSON.parse` results, child process output and caught `unknown` errors. Never use `as` to make untrusted data look typed.
- **Schemas are the source of truth.** Shared contracts live in `packages/shared` and types come from `z.infer`. Never hand-write a type that duplicates a schema.
- **Name schemas like types** (`WindowSample`, `IngestBatch`), and export the inferred type under the same name.
- **Fail closed:** use `.parse` where invalid data is a bug, and `.safeParse` where it is expected (user input), turning issues into a `400` with field paths but no internal details. Objects are `.strict()` at the public API so unknown fields are rejected.
- **Constrain everything:** string lengths, number ranges, enums and regexes (app IDs, for example). Unbounded strings and arrays are not allowed at the public API.
- **Execution:** `execFile` with an args array only. Never `shell: true`, never build a command from a string.
- **SQL:** parameterized queries only. Each service uses its own DB role and schema.
- **Logs:** never log titles, cmdlines, tokens, cookies or passwords. Use the pino redaction in service-kit or agent core.
- **Agent:** send process `comm` only, never `cmdline`. Never require the `docker` group. Save GNOME settings before changing them, and make them restorable after a crash. Never touch system apps.
- **Files:** `.env` and state files `0600`, their directories `0700`.
- **Dependencies:** prefer a popular, well-maintained library over hand-written infrastructure code (UI kit, query builder, retries, dates, HTTP plumbing). Justify every new one in the PR. It must be maintained, permissively licensed, and have no install scripts. Pin Actions to a SHA and images to a digest.
- **Containers:** non-root, read-only rootfs, `cap_drop: [ALL]`, `no-new-privileges`, memory limits. No docker.sock mounts.

## Language
- **All code is English:** identifiers, comments, log messages, error messages, commit messages, PR descriptions, `README.md` and code-level docs.
- **Docs are English too:** everything in `docs/` and this `CLAUDE.md`.
- Hebrew is allowed **only** in UI translation files (`**/i18n/he/**`, `**/i18n/he.json`). `npm run check` runs `scripts/check-language.ts`, which fails on Hebrew anywhere else.

## Code quality standard
This repo is a portfolio piece. Code should read like it was written by a strong senior engineer.
- **TypeScript:** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride`. No `any`, no non-null `!`, and no `as` casts except at validated boundaries. Exported functions have explicit return types.
- **Structure:** every service splits into `domain/` (pure logic, no IO, fully unit-tested), `adapters/` (DB, HTTP clients, D-Bus, filesystem) and `routes/` (thin: validate, call domain, map result). Dependencies are passed in, not imported as singletons, so everything is testable.
- **Errors:** typed error classes with stable codes. Never swallow errors. Only routes turn errors into HTTP responses, and never leak internals or stack traces.
- **Naming and files:** kebab-case file names, one concept per file, named exports only (no default exports), and no barrel files that re-export everything.
- **Functions:** small and single-purpose, with early returns and no deep nesting. No magic numbers: name constants.
- **Comments:** explain *why*, not *what*. TSDoc on exported APIs. No commented-out code, and no `TODO` without a task ID (`// TODO(T45): …`).
- **No `console.*`:** use the pino logger. Log structured fields, not string interpolation.
- **Tests:** Arrange/Act/Assert, descriptive names (`it('closes the session after a 15s gap')`), no sleeps (use fake timers), and no network. Test behavior, not implementation. Tests live in `<package>/test/`, mirroring `src/` (`src/core/buffer.ts` → `test/core/buffer.test.ts`), and never next to the code (`scripts/lib/` tests live in `scripts/test/`); repo-level suites stay in `tests/` (`tests/security/`, `tests/e2e/`).
- **Consistency beats cleverness:** follow the existing patterns in the repo. If a pattern is wrong, fix it everywhere in its own PR.

## Product rules
- **Boundaries:** web and agent talk only to the gateway. Services never call each other and never read another service's schema. The gateway orchestrates and owns only `gateway.settings`.
- **Battery budget:** the agent stays ≤ 0.5% CPU and ≤ 60MB RSS. No new polling without updating SPEC §4.1. Everything pauses while the screen is locked.
- **Design:** the UI is built with MUI. Colors, fonts, radii and spacing come only from the theme tokens (`apps/web/src/theme/`), mapped into the MUI theme. No hex values elsewhere, no gradients or shadows.
- **i18n:** every user-facing string goes in both `he` and `en` (Hebrew is the default). CSS uses logical properties only. Dates and numbers go through `Intl`.

## Stack
Node 22 + TypeScript (strict) · npm workspaces · Biome (lint + format, GritQL rules in `biome-plugins/`) · Fastify (fastify-type-provider-zod, helmet, sensible) · zod · pino · PostgreSQL 16 (node-pg-migrate, Kysely) · date-fns · p-retry · vitest · fast-check · Playwright · React 18 + Vite + MUI (Emotion, MUI X Charts) + react-hook-form + TanStack Query + react-i18next + MSW · dbus-next (agent) · Docker Engine + Compose v2 · GitHub Actions · cosign · syft · Trivy · Semgrep · CodeQL · gitleaks · ZAP.

## Commands
```
npm run setup            # create .env with random secrets (0600, safe to re-run)
docker compose up -d     # gateway, services, postgres, web
npm run agent:dev        # run the agent in the foreground
npm run check            # Biome lint + format, typecheck, language check
npm run format           # apply Biome fixes and formatting
npm test                 # unit tests with coverage thresholds
npm run test:security    # tests/security (ST01–ST19)
npm run security:todo    # list ST tests not enabled yet (--strict fails)
```
