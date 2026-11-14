# Dev CLI commands and checks

`@raypx/dev-cli` implements `raypx-dev`, the repository engineering executable.
It is separate from the retained product/device CLI, `raypx`. Use
`bun run raypx-dev <command>` from the root without installing a global link.
Workspace scripts declaring Dev CLI as a direct dependency can invoke it directly.
Its [workspace instructions](../../packages/dev-cli/AGENTS.md) define boundaries.

## Commands

| Command                                                                                                  | Behavior                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks <task> [Turbo options]`                                                                           | Run the sole workspace task graph; `src/turbo.ts` adds platform identity and default concurrency three.                                                   |
| `test [suite] [--package name\|path] [Turbo options] [-- runner flags]`                                  | Discover and run manifest-owned suites. `test list` shows actual capabilities.                                                                            |
| `e2e [--web\|--desktop] [--package web\|desktop] [--smoke] [--visual] [--dry-run] [-- Playwright flags]` | Build selected browser surfaces, then run Playwright independently of build cache keys.                                                                   |
| `format [--write] [files]`                                                                               | Check formatting by default; forward formatter flags to Vite+.                                                                                            |
| `workspace list`                                                                                         | Discover members from root workspace patterns and report derived kinds.                                                                                   |
| `workspace new <name> [--kind library\|app] [--target <target>] [--tests] [--write]`                     | Preview a scaffold; write only with `--write`, never overwrite. Targets select templates, not manifest platform constraints.                              |
| `i18n [types]`                                                                                           | Check language/namespace/key/ICU parity; `types` writes ignored literal type declarations.                                                                |
| `policy`                                                                                                 | Validate workspace graph, dependencies, exports/consumers, runtime boundaries, test ownership, toolchain, documentation links and repository conventions. |
| `verify [--full] [--no-cache] [--base ref] [--dry-run]`                                                  | Select affected source checks/tests and native inputs; full mode adds audits, builds and artifact probes.                                                 |
| `doctor`                                                                                                 | Check the Bun pin and report native prerequisites.                                                                                                        |
| `env -- <command>`                                                                                       | Load the development environment, preserving inherited values, and delegate to an external command.                                                       |
| `size [--package name\|path] [--native] [--browser] [--require]`                                         | Measure existing build outputs; never build implicitly. Missing outputs are unavailable and fail with `--require`.                                        |
| `smoke`                                                                                                  | Probe prepared production artifacts; this is not a source-only check.                                                                                     |
| `deployment:smoke [--platform linux/amd64\|linux/arm64]`                                                 | Build/probe isolated deployment images and synthetic accounts, cleaning only owned resources.                                                             |
| `analytics sourcemaps <web\|desktop>`                                                                    | Upload hidden maps for an existing recorded release before removing maps; never rebuild.                                                                  |
| `clean:artifacts`                                                                                        | Remove generated reports, coverage, test-report caches and browser results; preserve builds and user data.                                                |
| `clean`                                                                                                  | Also remove workspace build/cache outputs and staged native resources; preserve dependencies, environment files and persistent user/database data.        |

Use each command's `--help` for its syntax. Package scripts are leaves and never
re-enter the graph. Root `dev`, `build:*`, `check`, `test`, `package:desktop` and
database commands delegate through this executable and Turbo where appropriate.
`env` wraps migration/generation/studio commands; Dev CLI does not import database,
auth or product client implementations.

## Source verification

```sh
bun run verify
bun run verify --dry-run
bun run verify --no-cache
bun run verify --base origin/next
# Release preparation or an explicit full-validation request:
bun run verify --full
```

The plan prints its comparison SHA. The default is the merge-base with
`origin/canary`; `--base` selects a deliberate alternative. Scope includes committed
branch changes since that base as well as local edits. Local verification follows changed-source
imports for meaningful related tests, retaining complete suites for unknown,
configuration or deleted inputs. Source checks include transitive manifest
dependents, including development dependencies. CI and full mode run complete
selected workspace suites. `--no-cache` forces selected tasks to execute.

Documentation-only changes select policy/locales/style without database or browser
services. Shared JavaScript configuration/dependency changes broaden source checks
without automatically requesting builds/native platforms. Go-only changes select
Go tasks; mixed changes combine scopes. Desktop renderer work needs no native
runner unless native inputs changed. See
[verification planning and cache](validation-artifacts.md#verification-planning-and-cache).

## Explicit acceptance

```sh
bun run test inventory --layers
bun run test backends --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test_b
bun run test backends \
  --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test_b --with-e2e -- --workers=1
bun run test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
```

- `test inventory [--layers] [--baseline file] [--owners file]` executes fresh
  suites and checks exact selection, multiplicity and layer ownership.
- `test backends [--database-url URL] [--with-e2e [-- Playwright flags]]` runs API
  PostgreSQL, Redis and cluster modes. Without the explicit URL it provisions an
  owned temporary cluster. URLs must name disposable loopback `*_test` or
  `*_test_<lane>` databases without query options; inherited URLs never select a
  target. Explicit PostgreSQL is not created, stopped or dropped. Redis remains
  owned. `--with-e2e` starts the deterministic control API for browser journeys.
- `test sandbox [--engine-socket /absolute/socket] [--with-egress]
  [--dns-resolver IPv4] [--engine-host-command JSON]` owns a temporary supervisor,
  immutable computer image, real-Engine conformance, isolation and home replacement.
  Egress needs explicit opt-in and Linux Engine-host root/passwordless sudo. The
  VM command prefix is an argv array, with the checkout mounted at the same
  absolute path. Network controls and owned DROP counters establish enforcement;
  offline public access and missing IPv6 controls are unavailable.

See [testing](testing.md), [sandbox setup](sandbox.md), and
[validation evidence](validation-artifacts.md) for prerequisites and cleanup.
Default verification never starts these external services or paid inference.

## CI and evidence

Private `ci:plan` and `ci:gate` entries share the verification planner. One versioned
plan is bound to `GITHUB_SHA`; jobs consume `RAYPX_CI_PLAN` rather than recomputing
scope. Separate source checks/tests, backend, browser, sandbox, container and native
gates run from that plan. The final job rejects failures, cancellation, missing
required jobs and unexplained skips. Branch gates select only relevant acceptance;
tag/manual distribution gates include prepared artifacts and platform packaging.

Reusable checks live in `src/validation/`; generic repository mechanics stay in
`src/repo/`. `.artifacts/` contains generated evidence only. Inventory/backend/
sandbox/deployment commands own temporary services, label their resources and stop
only their own children before removing data. Do not run global cleanup or prune.
Reports distinguish passed, failed and unavailable results and never establish an
unrun platform. Full verification uses prepared CLI payloads and isolated artifact
probes; it is broader than ordinary source validation.

`size` writes exact byte/file counts under `.artifacts/sizes/`; overlapping CLI,
renderer, bundle and installer sizes must not be added together. CI uploads
selected evidence and summaries independently of task caches. See the
[Desktop release guide](desktop.md#build-and-release) for immutable payloads,
Go/MyGo checks, signatures and installed acceptance.

## Analytics source maps

Upload requires hidden maps and protected release credentials. The build records
the release identity from its explicit public override, deployment SHA or Git SHA.
Use that recorded identity at upload time; reject a conflicting override. Do not
infer a deployed version from a newer checkout or expose upload credentials in
client variables. `clean:artifacts` removes evidence, not deployment assets.
