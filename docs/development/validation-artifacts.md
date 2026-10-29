# Validation scripts and generated evidence

Reusable repository checks live in `packages/tooling/src/validation/` and are
exposed through `raypx-dev`. Feature fixtures stay with their owning workspace's
`tests/`; product code never imports these tools. `.artifacts/` is ignored,
disposable output: logs, reports, screenshots, traces and generated comparisons.
Do not author or maintain scripts there. One-time migrations are removed after
verification; their generated evidence may remain until cleanup.

Root commands aggregate through `bun run test <suite>`; Tooling owns independent
`test:inventory` and `test:backends` scripts. See [test command ownership](test-commands.md).

## Test inventory and preservation

```sh
bun run test inventory
bun run test inventory --layers
bun run test inventory --baseline .artifacts/tests/<previous-run>/inventory.json
```

Each invocation executes fresh tests with the pinned runtimes, then writes a new
`.artifacts/tests/<run>/` containing raw workspace reports, logs and `inventory.json`.
`--layers` runs the unit, component and integration entries separately and checks
that their file selections do not overlap. Both modes require every ordinary
test source to execute exactly once; database/Redis and Playwright gates are
listed separately. Missing, stale, failed or skipped ordinary reports fail the audit.
Normal `bun run test` and `verify` retain their existing runner/cache behavior.

Baseline comparison preserves the multiplicity of `workspace + full case name`,
allowing file moves. Missing cases fail; added coverage is recorded without failing.
For an intentional cross-workspace move, `--owners path/to/mapping.json` accepts an
explicit mapping from a baseline file to its new workspace name:

```json
{
  "apps/web/tests/component/features/example.test.tsx": "@raypx/tasks"
}
```

The mapping must refer to actual baseline files. Baselines are never overwritten.
Keep the baseline outside disposable output or copy it elsewhere before cleaning
if it must survive `clean:artifacts`. Partial source checks and case counts do not
establish line coverage or platform acceptance.

## Owned PostgreSQL, Redis and browser backend gates

```sh
bun run test backends
bun run test backends --with-e2e
bun run test backends --with-e2e -- --workers=1
```

This explicit POSIX gate promotes the earlier local backend-validation scripts.
Provide PostgreSQL's `initdb`, `postgres`, `pg_isready` and `createdb` on PATH, or set
`TEST_POSTGRES_BIN` to their directory. Redis's `redis-server` comes from PATH or
`TEST_REDIS_BINARY`. These are test prerequisites, not product dependencies;
provisioning is not part of default verify. Run as an ordinary user, as required
by `initdb`. Missing prerequisites fail before any service is started.

The default runs API Node PostgreSQL and Redis tests. `--with-e2e` additionally starts the existing
isolated control API fixture and runs the complete browser suite against it; this
requires installed Playwright Chromium. It does not authorize external inference
or replace real HTTPS, packaged Native or Windows acceptance.
Playwright flags after `--` retain the normal browser launcher's selection rules;
use `--workers=1` on a busy machine. `VP_RUN_CONCURRENCY_LIMIT=1` likewise lowers
workspace-task concurrency for inventory or backend gates without changing assertions.

Each run creates its own temporary data, loopback ports and random SCRAM password.
Operator database/Redis URLs are replaced; no existing service or volume is used.
External Agent inference is explicitly disabled even when the parent environment
has a live-acceptance opt-in; run that separate gate deliberately instead.
Processes are stopped on success, failure or handled interruption before their data
is removed. Generated logs and reports remain in `.artifacts/backends/<run>/`.
The fixture API requires the explicit server-only `RAYPX_VALIDATION=1` flag plus
an isolated `*_test` database and valid fixture port. Validation never sets
`NODE_ENV=test`; inherited `NODE_ENV` is removed so builds retain Vite's normal
mode. `VITE_NODE_ENV` is not a replacement: Vite/React reserve `NODE_ENV` behavior,
and custom `VITE_*` values may be exposed to client code.
The command manifest contains labels, exit codes and timings, never argv/environment.
Treat all raw test evidence as local; review it before sharing.

## Cleanup

| Command                   | Removes                                                                                                                 | Preserves                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun run clean:artifacts` | Root/workspace `.artifacts/`, workspace coverage, root/workspace `node_modules/.cache/raypx-tests`, E2E results/reports | Built applications, Desktop SDK/packages, VP transform/task caches, source, dependencies, user/database data |
| `bun run clean`           | Report cleanup plus application builds/tool caches, staged native resources                                             | Source, dependencies, lockfiles, environment files, Git history, user profiles and database volumes          |

Cleanup is explicit and idempotent. Do not run it during verification or while
inspecting reports; it removes local evidence without a recovery archive. New runs
create new reports, but do not recreate deleted historical results. No age-based
background deletion is installed.

The 2026-10-27 organization removed the snapshot-specific VP benchmark/probe,
AST split/rewrite and old commit-message scripts from `.artifacts/`. Inventory,
case-preservation and backend workflows now have maintained entry points above.
Historical logs and benchmark results remain generated evidence.
