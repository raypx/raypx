# Engineering scripts

`scripts/bin/raypx.ts` is the unified repository CLI, run with Bun and exposed
as `bun run raypx`. The existing root command names
are aliases for its subcommands. Command definitions handle options and lifecycle;
modules in `lib/` group implementation by responsibility. These are repository
tools, not a public workspace or application runtime dependency.

```text
scripts/
  bin/
    raypx.ts                 Bun CLI and dependency-free bootstrap routing
  cli.ts                     citty command registration and strict dispatch
  commands/                  Installed repository command definitions
  doctor.ts                  Diagnostic CLI and Bun env bootstrap
  doctor-database.ts         Isolated read-only database probe
  check-consumer.ts          Compatibility entry for raypx consumer
  test-consumer-browser.ts   Compatibility entry for raypx consumer-browser
  setup.ts                   Create local configuration
  install-hooks.ts           Enable the Vite+ dispatcher
  lib/
    cli/                     Bootstrap metadata, native help, and dispatch
    doctor/                  Local checks, probes, report, and orchestration
    consumer/                Lock graph, fixtures, types, runtimes, and browser
    dependencies/            Offline toolchain compatibility checks
    policy/                  Read-only workspace, TypeScript, and documentation rules
    verify/                  Ordered acceptance gates and phase reporting
    logger.ts                Plain-text consumer phase logging with consola
    process.ts               Bounded subprocess execution and cleanup
  test/                      Node unit and subprocess regression tests
  browser/                   Independent consumer Playwright scenarios
  vite.config.ts             Named scripts test project
  tsconfig.json              Root script and configuration type checking
```

## Commands

```sh
bun run raypx --help
bun run raypx env
bun run raypx setup
bun --no-env-file run raypx doctor --json
bun run raypx consumer --kind core
bun run raypx consumer-browser
bun run raypx deps
bun run policy
bun run policy --json
bun run verify
bun run verify --verbose
bun raypx clean --dry-run
bun run clean
bun run test:scripts
bun run typecheck:scripts
bun --no-env-file run doctor
bun run check:consumer
bun run check:consumer --kind core
bun run test:consumer:browser
```

`test:scripts` uses Vite+/Vitest with a Node environment. Doctor tests launch Bun
against synthetic repositories; lock and process tests import Node-compatible
modules without loading Bun's runtime APIs. The browser suite uses Playwright
and is excluded from the unit project's `test/**/*.test.ts` pattern.

`check:consumer` installs copied build artifacts outside the repository, then
checks declarations, Node/Bun runtimes, and the browser bundle. Interactive
browser verification has its own command. Both entrypoints own temporary fixture
cleanup; subprocesses have deadlines and terminate their process groups on failure.
The installed CLI uses citty for help and typed options. `check:consumer` defaults
to all three fixtures; `--kind core|server|browser|all` selects its scope. Invalid
options fail before building or fixture creation. Consumer commands validate the
toolchain, build shared packages, and check script types in their execution stage.
Help never starts those steps:

```sh
bun run raypx consumer --help
bun run check:consumer --help
bun run raypx consumer-browser --help
```

Run the source directly with `bun --no-env-file --no-install scripts/bin/raypx.ts --help`
or use the root Bun script. These flags disable env-file loading and automatic
dependency installation. For doctor, the outer `bun --no-env-file` preserves application
env loading in `apps/web`. A fresh checkout can use root help/version, doctor,
development env checking, and setup without installing third-party packages;
consumer, dependency, policy, and verify commands require `bun install`.

`clean` also uses the installed citty command tree and requires `bun install`.
Its help and dry-run do not build packages or create consumer fixtures.

`raypx deps` checks coupled toolchain versions against root catalogs and the
installed Vite+ runner, without network or writes. `deps:outdated` and `deps:update`
are thin aliases for Bun’s native workspace commands. See
[dependency maintenance](../docs/VERSION_STRATEGY.md) for the upgrade workflow.

See [consumer acceptance](../docs/CONSUMER_TESTING.md) and
[doctor diagnostics](../docs/DOCTOR.md) for behavior and options.

The root `test`, `typecheck`, and `check` commands explicitly include script
validation because workspace task filters exclude the repository root. Script
tests run without a task cache. A later project sequence group runs tool diagnostics
after workspace units in aggregate test/watch sessions, avoiding contention between
their subprocesses. Root `vitest.config.mts` registers the project,
and Knip declares tests and subprocess entrypoints explicitly; libraries remain
reachable through real imports so unused modules are still detected.

## Cleaning generated files

Stop development servers, Storybook, and package watchers before running clean.
These commands use the same installed command:

```sh
bun run clean --dry-run
bun run clean
bun raypx clean
bun raypx clean --help
```

`--dry-run` prints candidate paths without removing them. Cleanup uses an
allowlist at the repository root, `scripts`, and direct `apps/*` and `packages/*`
workspace directories containing a regular `package.json` file:

- `dist`, `.output`, `.tanstack`, `coverage`, `.vitest`, `storybook-static`,
  `playwright-report`, `test-results`, and direct `*.tsbuildinfo` files.
- Within each directory's `node_modules`, only `.vite`, `.vite-temp`, `.nitro`,
  and `.cache/storybook`, `.cache/sb-vite-plugin-externals`, and `.cache/jiti`.
- Root `.ci-reports` and `apps/web/src/routeTree.gen.ts`.

It does not recursively search source directories or traverse parent-directory
symlinks. Missing outputs are harmless. Installed dependencies, Bun and browser
global caches, `.env` files, local databases and `data/`, storage data, database
migrations, and the installed Git hook dispatcher remain intact.
Run `bun run build` afterward to recreate package and application outputs;
Storybook and test commands regenerate their own outputs when needed.

## Repository policy and acceptance

`raypx policy` checks repository structure without changing files or contacting
external services. It reports missing or invalid workspace manifests, duplicate
names, and workspaces omitted from the root declarations. TypeScript checks
resolve configuration inheritance, including relative chains and both public
config preset paths, and report missing targets or cycles. Intentional compiler
option overrides remain valid.

Documentation checks use first-party Markdown tracked by Git or untracked and
not ignored. They check local link targets and reachability of documents under
`docs/` from `docs/INDEX.md`; code examples, external URLs, and anchor fragments
are excluded. Historical documents remain linked from the index and carry
explicit historical notices. Dependency and build directories are excluded.

The text report names each rule, repository-relative path, problem, and suggested
fix. `--json` emits the same results as one JSON object containing `findings` and
`errors`; each finding has `rule`, `path`, `message`, and `fix`. Success exits 0;
findings or execution failures exit 1. There is no automatic-fix mode. Package
boundaries, dependency compatibility, and unused code retain their existing
dedicated checks.

`raypx verify` runs the acceptance gates in this order:

1. Development environment, dependency compatibility, policy, formatting,
   package boundaries, and unused code.
2. Workspace builds.
3. Typed lint, workspace types, and script types.
4. Workspace tests and script tests.
5. Storybook's static build.
6. Independent core, server, and browser-build consumers.

The first failure stops the workflow. Default output reports stage results and
elapsed time, with the failed command and bounded subprocess output on failure;
`--verbose` streams subprocess output. Timeouts and interrupts clean up process
groups, and an interrupt prevents later stages from starting. The workflow
preserves the caller's environment; individual test and consumer fixtures keep
their isolated environments.

`bun run check` and `bun run verify` use the same entrypoint. Verify reuses its
successful build and script-type stages when running consumers. Standalone
`raypx consumer` still performs its own preparation; there is no public option
to bypass it. CI's quality job runs verify once, while browser interaction suites
remain in the separate browsers job. Vite+ continues to own the task graph.

## Adding a script

Register installed repository commands in `scripts/cli.ts`, with their definitions
in `scripts/commands/`. Keep command modules light at import time: citty loads
their metadata when rendering root help. Load implementation and run prerequisites
only inside the command's `run`. The bin handles bootstrap commands before
importing installed tooling.
Leave reusable package tooling in `packages/config/src/`. Extract substantial
logic into the relevant `lib/` directory, with explicit inputs and return values.
Keep parsers and validators independent of CLI printing and process exits.
Avoid a shared barrel that loads Bun or browser machinery into Node unit tests.

citty and consola are root development dependencies for installed tooling. Use
`lib/logger.ts` for repository phase summaries; leave child-process output intact.
The logger uses plain text and an explicit info level so output remains visible
in CI and `NODE_ENV=test`. Do not wrap global console methods. `check:env`,
preinstall, setup, and doctor must continue working before dependencies are
installed; the bin's static bootstrap imports stay free of third-party packages.
Do not add a global environment gate before diagnostic dispatch. Doctor's JSON
reports and Bun's native application env loading keep their existing behavior.

Add regression tests for observable behavior such as invalid input, deadlines,
resource cleanup, or a dependency boundary. Use `vite-plus/test`; put browser
scenarios in `browser/` and declare subprocess-only files in Knip when static
imports cannot discover them. Run `test:scripts`, `typecheck:scripts`, and the
affected real command; run the complete `check` for acceptance changes.

This layout adapts patterns inspected in vinext's
[command wrapper](https://github.com/cloudflare/vinext/blob/main/scripts/ci-integration-shard.mjs),
[planning library](https://github.com/cloudflare/vinext/blob/main/scripts/lib/integration-shard-plan.mjs),
and [test project](https://github.com/cloudflare/vinext/blob/main/vite.config.ts).
Raypx uses its existing Bun/Vite+ toolchain and acceptance behavior.
