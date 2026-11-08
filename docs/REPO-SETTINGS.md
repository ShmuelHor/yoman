# Repository settings

`scripts/github-protect.sh` applies everything below with `gh api` only. It is idempotent: each call sets the desired state, so re-running it is safe.

```
scripts/github-protect.sh --dry-run            # print every API call, change nothing
scripts/github-protect.sh [owner/repo]         # apply (default: ShmuelHor/yoman)
```

It needs `gh` authenticated with admin rights, and is run by the coordinator only after the repo owner approves.

## Visibility: public

The repository stays **public**, by decision of the repo owner. Reasons: it is a portfolio project, and public repos get CodeQL code scanning, secret scanning with push protection, and dependency review for free. Nothing sensitive lives in the repo (see `CLAUDE.md` security rules), and all tracked data stays local.

## Branch protection on `main`

| Setting | Value | Why |
| --- | --- | --- |
| Pull request required | yes, **0** required approvals | One account owns the repo and GitHub does not let an author approve their own PR. The approval record is the reviewer's `Verdict: approved` line. |
| Required status checks | all checks below | Nothing merges unless CI and every security scan pass. |
| Require branches up to date (`strict`) | yes | A PR is tested against the current `main`, not a stale base. |
| `enforce_admins` | true | The owner cannot bypass the rules by accident. |
| `required_conversation_resolution` | true | Every review thread is answered before merge. |
| `required_linear_history` | true | Matches rebase/squash merging; `main` stays readable and bisectable. |
| `allow_force_pushes` | false | History on `main` is never rewritten. |
| `allow_deletions` | false | `main` cannot be deleted. |

### Required checks

These are the job names that run on `pull_request` in `.github/workflows/ci.yml` and `security.yml`. If you rename or add a job, update `CHECKS` in the script and this list in the same PR.

CI: `Lint (Biome)`, `Typecheck`, `Unit tests (coverage)`, `Language check`, `Build (workspaces)`, `Commit messages`, `Security tests`.

Security: `gitleaks (full history)`, `npm audit`, `OSV-Scanner`, `Dependency review`, `CodeQL`, `Semgrep`, `hadolint`, `Trivy fs and config`, `actionlint`, `zizmor`.

`Commit messages` and `Dependency review` only run on pull requests, which is fine because merging requires a PR anyway.

## Merge settings

- Squash and rebase merges allowed, merge commits disallowed: the coordinator rebase-merges clean branches and squash-merges ones with commits that must not reach `main` (see `CLAUDE.md`). Merge commits would break linear history.
- `delete_branch_on_merge`: merged branches disappear on their own.

## Security and analysis

- **Secret scanning** and **push protection**: a second line of defence next to gitleaks; a push containing a recognised secret is rejected.
- **Dependabot security updates**: automatic PRs for vulnerable dependencies.
- **Dependabot alerts** (vulnerability alerts): the data source for those updates and for dependency review.

Features already enabled are left as they are.

## Actions

- **Allowed actions: selected.** GitHub-owned actions (`actions/*`, `github/*`) plus these third-party owners, which the workflows use today: `aquasecurity`, `docker`, `google`, `ossf`, `sigstore`, `zizmorcore`. Marketplace-verified creators are not allowed wholesale. Add an owner to the script only when a workflow needs it. Actions are also pinned to a commit SHA in the workflows.
- **Default workflow permissions: read.** Workflows get a read-only token unless a job asks for more explicitly.
- **Actions cannot approve pull requests**, so a workflow can never satisfy review rules on its own.
