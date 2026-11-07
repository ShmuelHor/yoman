## What and why

<!-- Task ID (e.g. T13) and a short summary of the change and the reason for it. -->

## How it was tested

<!-- Commands run, new tests, and any manual checks. -->

## Security checklist (docs/SECURITY.md §6)

- [ ] Every external input is validated with zod at the boundary
- [ ] No secrets, window titles or tokens in logs or error messages
- [ ] No `shell: true` and no commands built from strings
- [ ] SQL uses parameters only
- [ ] No new ports, and no CORS, Host or CSP changes without updating SECURITY.md
- [ ] New dependencies are justified below, maintained, permissively licensed and have no install scripts
- [ ] Security tests owned by this task are real tests, not `it.todo`
- [ ] New files are created with the permissions in SECURITY.md §5

## Security tests enabled

<!-- e.g. ST03, ST04, or "none". -->

## New dependencies

<!-- Name, why it is needed, and alternatives considered, or "none". -->
