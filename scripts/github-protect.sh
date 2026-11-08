#!/usr/bin/env bash
# Apply Yoman's GitHub repository protections (docs/REPO-SETTINGS.md).
# Idempotent: every call is a PUT/PATCH of the desired state, so re-running is safe.
# Usage: scripts/github-protect.sh [--dry-run] [owner/repo]   (default: ShmuelHor/yoman)
# Needs `gh` authenticated with admin rights on the repo. Run only after the repo
# owner approves.
set -euo pipefail

DRY_RUN=0
REPO="ShmuelHor/yoman"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    -*)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
    *) REPO="$arg" ;;
  esac
done

if [[ ! "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "invalid repo: $REPO (expected owner/name)" >&2
  exit 2
fi

# api METHOD PATH [JSON_BODY]: one gh api call, or just print it in dry-run mode.
api() {
  local method="$1" path="$2" body="${3:-}"
  if ((DRY_RUN)); then
    echo "DRY-RUN: $method /repos/$REPO$path"
    [[ -n "$body" ]] && echo "$body"
    return 0
  fi
  echo "$method /repos/$REPO$path"
  if [[ -n "$body" ]]; then
    printf '%s' "$body" | gh api --method "$method" "/repos/$REPO$path" --input - >/dev/null
  else
    gh api --method "$method" "/repos/$REPO$path" >/dev/null
  fi
}

# Required status checks: the `name:` of every job in ci.yml and security.yml
# that runs on pull_request. Keep in sync with those files (see docs/REPO-SETTINGS.md).
CHECKS='[
  "Lint (Biome)",
  "Typecheck",
  "Unit tests (coverage)",
  "Language check",
  "Build (workspaces)",
  "Commit messages",
  "Security tests",
  "gitleaks (full history)",
  "npm audit",
  "OSV-Scanner",
  "Dependency review",
  "CodeQL",
  "Semgrep",
  "hadolint",
  "Trivy fs and config",
  "actionlint",
  "zizmor"
]'

# 1. Branch protection on main.
api PUT /branches/main/protection "$(
  cat <<JSON
{
  "required_status_checks": {"strict": true, "contexts": $CHECKS},
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
)"

# 2. Merge settings.
api PATCH "" '{
  "delete_branch_on_merge": true,
  "allow_squash_merge": true,
  "allow_rebase_merge": true,
  "allow_merge_commit": false
}'

# 3. Security and analysis. Enabling is a no-op for features already on.
api PATCH "" '{
  "security_and_analysis": {
    "secret_scanning": {"status": "enabled"},
    "secret_scanning_push_protection": {"status": "enabled"},
    "dependabot_security_updates": {"status": "enabled"}
  }
}'

# 4. Dependabot vulnerability alerts.
api PUT /vulnerability-alerts

# 5. Actions: GitHub-owned actions plus the third-party owners our workflows use.
api PUT /actions/permissions '{"enabled": true, "allowed_actions": "selected"}'
api PUT /actions/permissions/selected-actions '{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": [
    "aquasecurity/*",
    "docker/*",
    "google/*",
    "ossf/*",
    "sigstore/*",
    "zizmorcore/*"
  ]
}'
api PUT /actions/permissions/workflow '{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}'

if ((DRY_RUN)); then echo "done (dry run, nothing changed)"; else echo "done"; fi
