# Security tests

The automated security tests from `docs/SECURITY.md` section 3, one file per test:
`stNN-<slug>.test.ts` for ST01 to ST18, directly in this directory. Helpers live in `lib/` and
fixtures in `fixtures/`.

```
npm run test:security             # run the suite (vitest.security.config.ts)
npm run security:todo             # list the tests that are still todo, by owning task
npm run security:todo -- --strict # the release gate: exit 1 unless every test is active and passing
```

## Owning a todo

A test that is not active yet is an `it.todo` whose name starts with the ID of the task that must
enable it:

```ts
describe('ST04 host allowlist', () => {
  it.todo('[T19] a request with a foreign Host header returns 421');
});
```

A test with more than one owner has one `it.todo` per owner (ST07, ST08, ST11, ST12, ST15, ST17),
so each task enables its own part. To enable a test, replace its `it.todo` with a real `it` in the
same file and drop the `[Txx]` prefix. When a test can only run once something exists, register it
as an owned todo until then (ST01 does this for the repo's Compose project, owned by T10); don't
skip it at runtime.

## How `security:todo` decides

It runs the suite with Vitest's JSON reporter and reads the status of every test, so it sees every
way a test can be switched off, not just the ones a text search would find.

| Finding                                                                                    | Without `--strict` | With `--strict` |
| ------------------------------------------------------------------------------------------ | ------------------ | --------------- |
| Owned todo                                                                                 | listed, exit 0     | exit 1          |
| Skipped test (`.skip` in any form, `skipIf`, `runIf`, a context `skip()`)                  | listed, exit 0     | exit 1          |
| Test declared with `.fails`                                                                | listed, exit 0     | exit 1          |
| Failing test, or a file that fails to load                                                 | exit 1             | exit 1          |
| `.only` (the config sets `allowOnly: false`, so it fails the run)                          | exit 1             | exit 1          |
| Todo without a `[Txx]` owner                                                               | exit 1             | exit 1          |
| A test file not named `stNN-<slug>.test.ts` directly here, or an ST ID with no file or two | exit 1             | exit 1          |

Vitest's JSON report shows a `.fails` test as passed, so `lib/record-modifiers.ts`, a setup file,
marks it in the test's meta for the gate to read. `npm run security:todo --strict` (without `--`)
works too: npm turns the flag into `npm_config_strict`, which the script reads.

## ST01: compose policy

`lib/compose-config.ts` resolves the repo's Compose project the way `docker compose up` finds it:
it runs `docker compose --env-file .env.example --profile '*' config --format json` from the repo
root, with no `--file`. Compose then picks any standard file name (`compose.yaml`, `compose.yml`,
`docker-compose.yaml`, `docker-compose.yml`) and merges the override file, and every profile is
enabled. The child process gets only `PATH`, `HOME` and `DOCKER_CONFIG`, so `COMPOSE_FILE`,
`COMPOSE_PROFILES` and shell variables can't change what is checked. Interpolation reads only
`.env.example` (or nothing while it doesn't exist), never a developer's real `.env`. The command
needs the Compose CLI but no running Docker daemon.

`lib/compose-policy.ts` then checks every service. Each rule has a stable ID, shown in brackets.

- **Ports** `[published-port]`: only `127.0.0.1:4710` and `127.0.0.1:4711` may be published.
- **Host network** `[host-network]`: no `network_mode: host`, no `network_mode: container:<id>`
  (which joins a container outside the project), and no attachment to a network named `host` or
  using the `host` driver. `network_mode: service:<name>` is allowed, because that service is
  checked itself.
- **User** `[non-root]`: `user` must be a numeric, non-zero uid with an optional non-zero gid, such
  as `1000:1000`. Names are rejected, because the image's `/etc/passwd` can map any name to uid 0.
  Forms like `00` or `+0` are rejected, because runc parses them as uid 0.
- **Read-only root** `[read-only]`: `read_only: true`.
- **Capabilities** `[cap-drop]`, `[cap-add]`: `cap_drop` contains `ALL`, and `cap_add` is empty,
  since Docker applies it after the drop.
- **Host namespaces** `[host-namespace]`: no `pid: host`, `ipc: host` or `userns_mode: host`.
- **Devices** `[devices]`: no host devices mapped in.
- **No new privileges** `[no-new-privileges]`: the last `no-new-privileges` entry in `security_opt`
  wins, as in Docker, and it must be `no-new-privileges`, `no-new-privileges:true` or
  `no-new-privileges=true`.
- **Confinement** `[unconfined-profile]`: no `seccomp:unconfined`, `seccomp=unconfined`,
  `apparmor:unconfined` or `apparmor=unconfined`.
- **Privileged** `[privileged]`: not `privileged: true`.
- **Memory** `[memory-limit]`: a positive `mem_limit` or `deploy.resources.limits.memory`.
- **Docker socket** `[docker-socket]`: no mount exposes the socket. That covers a bind mount of the
  socket itself, of any directory that contains it (`/var/run`, `/run`, `/var`, `/`), or of the
  rootless runtime directory `/run/user`, and a named volume whose `driver_opts.device` binds one of
  those paths.
- **Build source** `[build-source]`: a service with `build` must build from a local context inside
  the project, with its Dockerfile and every additional context also inside the project, and
  without `dockerfile_inline`. Remote and git contexts are rejected.
- **Image** `[image-digest]`: `image` must be pinned by `@sha256:` digest, including an `image` set
  next to `build`, because `docker compose pull` can fetch it instead of building. A service with
  `build` and no `image` has nothing to pin: its base images are reviewed in the Dockerfile, which is why the build source must be a Dockerfile in this repo.

`fixtures/compose/` holds a compliant project and copies that each break one rule (an extra port,
a missing `read_only`), plus a project whose override file breaks the policy, to prove the whole
path from YAML to a failing test.

## ST02: secrets

- No env file is tracked by git, anywhere in the tree, except files named exactly `.env.example`.
  Env files are `.env`, `.env.<anything>` and `<anything>.env`, in any casing.
- Every tracked `.env.example`, at any depth, holds only placeholders: an empty value, or
  `change-me` with an optional suffix of lowercase words joined by hyphens, at most 32 characters
  after `change-me` (for example `change-me-run-npm-run-setup`). The suffix has no digits, so a hex
  or base64 secret can't hide behind the prefix. Non-secret defaults belong in code or Compose.
- Fixture values in the tests are obviously fake and low-entropy, or built at runtime, so gitleaks
  never sees a token-shaped literal.

Scanning for leaked secrets with gitleaks is part of ST02 but runs outside this suite: in the
pre-commit hook (T02) and the CI security job (T04).
