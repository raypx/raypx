# Test commands and package ownership

The repository exposes one root test entry. Each workspace's package.json keeps
its own real suites; VP discovers and aggregates those scripts. No separate testing
workspace owns another package's cases.

```sh
bun run test --help
bun run test list
bun run test
bun run test unit
bun run test component
bun run test integration
bun run test coverage
```

Default tests remain database-free. Explicit PostgreSQL, Redis, browser, Native and
live-inference gates are not pulled into ordinary `test` or default package tests.
Root test follows the current task graph, including Cargo when enabled; the JSON
inventory audits Bun/Vitest suites and lists external browser/database files separately.

## Independent packages

```sh
bun run --cwd packages/tasks test
bun run --cwd packages/tasks test:unit
bun run --cwd packages/tasks test:component
bun run --cwd packages/host test:integration
bun run --cwd apps/api test
bun run --cwd apps/api test:postgres
bun run --cwd apps/api test:postgres:cloudflare
bun run --cwd apps/api test:redis
```

Only layers with actual suites get scripts. Root selection accepts the full name,
workspace path or an unambiguous directory name. Running `raypx-dev test` within a
workspace also selects that workspace automatically.

```sh
bun run test --package @raypx/tasks
bun run test component --package tasks
bun run test unit --package packages/tasks -- --testNamePattern conversation
bun run test --filter=@raypx/ui
bun run test '--filter=...@raypx/ui'
```

Use `--package` when forwarding runner arguments to one package. Existing VP
filters remain available for graph selections; do not combine them with `--package`.
VP options go before `--`; filenames, reporters and other runner arguments go after.
Package-local scripts accept runner arguments directly, as before.
The API Worker entry reserves `--dry-run` and `--no-cache` for its VP graph;
put a literal runner option with either name after an explicit `--`.

## Browser and repository workflows

```sh
bun run test e2e --web --smoke -- --workers=1
bun run --cwd e2e e2e
bun run --cwd e2e e2e:web
bun run --cwd e2e e2e:desktop -- --grep template
bun run --cwd e2e e2e --web --dry-run

bun run test inventory --layers
bun run --cwd packages/tooling test:inventory
bun run --cwd packages/tooling test:backends --workers-only
bun run test backends --with-e2e -- --workers=1
```

Browser commands use the same scoped arguments and build plan from root or `e2e/`.
Worker PostgreSQL tests build their actual Cloudflare artifact before execution,
including when invoked directly from `apps/api`. Private `_e2e` and
`_test:postgres:cloudflare` scripts are terminal runners for VP, not public entry points.
`raypx.taskScripts` connects each public command to a real private script, rejecting
chains or missing targets so a direct command cannot recursively enter its own graph.

Inventory and isolated-backend orchestration belong to Tooling and stay repository-wide,
even when launched from that package. Baseline/mapping filenames resolve against
the caller's current directory. Prerequisites, generated reports and cleanup are in
[validation artifacts](validation-artifacts.md). Live inference remains a separate,
explicit `bun run --cwd e2e e2e:live` gate with its existing prerequisites.

## Migration from root aliases

The root `test:*` aliases have moved to their owning workspace or become a subcommand:

| Previous root command                                              | Current entry                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `test:unit`, `test:component`, `test:integration`, `test:coverage` | `test unit`, `test component`, `test integration`, `test coverage`                |
| `test:postgres`, `test:redis`, `test:postgres:cloudflare`          | `test postgres`, `test redis`, `test postgres:cloudflare`, or API package scripts |
| `test:e2e:web`, `test:e2e:desktop`                                 | `test e2e --web`, `test e2e --desktop`, or E2E package scripts                    |
| `test:e2e:smoke`, `test:e2e:visual`                                | `test e2e --smoke`, `test e2e --visual`                                           |
| `test:inventory`, `test:backends`                                  | `test inventory`, `test backends`, or Tooling package scripts                     |

Low-level `raypx-dev tasks <package>#<task>` and `raypx-dev e2e` remain compatible.
Build/check/dev, Native smoke and database administration retain their existing entries.

## Verification record, 2026-10-27

Root and package-local Tasks unit entries each passed the same 32 case identities.
Routing, graph/delegation and cache regressions passed 18 cases. Tooling's package-local
backend entry passed six real workerd/PostgreSQL cases, including Hyperdrive.
The package-local full browser entry passed 28 cases with two explicit environment
gates skipped. No Native, real HTTPS or external inference acceptance is implied.
Full `bun run verify` passed, including the current workspace's Cargo gates and
Node/Workers/standalone artifact probes. A CLI fixture now waits for actual host
readiness and protocol delivery instead of assuming that observing stdin or a
persisted sent status proves the other process has finished reading it.
Raw evidence remains under ignored `.artifacts/test-commands/`.
