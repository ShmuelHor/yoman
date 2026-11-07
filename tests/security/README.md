# Security tests

The automated security tests from `docs/SECURITY.md` section 3, one file per test:
`stNN-<slug>.test.ts` for ST01 to ST19.

```
npm run test:security             # run the suite (vitest.security.config.ts)
npm run security:todo             # list the tests that are still todo, by owning task
npm run security:todo -- --strict # same, but exit 1 while any test is still todo
```

## Owning a todo

A test that is not active yet is an `it.todo` whose name starts with the ID of the task that must
enable it:

```ts
describe('ST04 host allowlist', () => {
  it.todo('[T19] a request with a foreign Host header returns 421');
});
```

A test with more than one owner has one `it.todo` per owner (ST07, ST11, ST12, ST15, ST17), so
each task enables its own part. To enable a test, replace its `it.todo` with a real `it` in the
same file and drop the `[Txx]` prefix.

`security:todo` reads these files as text, without running them, and fails closed. It exits 1,
even without `--strict`, when:

- a todo has no `[Txx]` owner, or isn't `it.todo` with a plain string name
- a test is disabled with `it.skip`, `describe.skip` or `skipIf` (use an owned `it.todo` instead)
- a file in this directory isn't named `stNN-<slug>.test.ts`, or an ST ID has no file or two

A test may still skip at runtime through the test context (`({ skip }) => …`) when the thing it
checks doesn't exist yet, with a reason that names the task that adds it. ST01 does this for the
repo's `docker-compose.yml` (T10) and ST02 for `.env.example` (T02).

## ST01: compose policy

`lib/compose-policy.ts` checks the model printed by `docker compose config --format json`, with
every profile enabled. That command needs the Compose CLI but no running Docker daemon. Each
service must:

- publish only `127.0.0.1:4710` and `127.0.0.1:4711`, and not use `network_mode: host`
- run as a user other than root or `0`
- set `read_only: true`, `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]`
- not be `privileged`
- have a memory limit (`mem_limit` or `deploy.resources.limits.memory`)
- not bind-mount the Docker socket or a directory that contains it
- use an image pinned by `@sha256:` digest, unless it has `build` (its base images are checked
  in the Dockerfile by hadolint and Trivy)

`fixtures/compose/` holds a compliant project and copies that each break one rule, to prove the
whole path from YAML to a failing test.

## ST02: secrets

No env file other than `.env.example` is tracked by git, anywhere in the tree. Every entry in
`.env.example` is a placeholder: an empty value, or `change-me` with an optional kebab-case
suffix (`change-me-sessions-db`). Non-secret defaults don't belong there. Scanning for leaked
secrets (gitleaks) runs in the pre-commit hook and in CI rather than here.
