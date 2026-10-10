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
  commands/                  Installed consumer command definitions
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
consumer commands require `bun install`.

See [consumer acceptance](../docs/CONSUMER_TESTING.md) and
[doctor diagnostics](../docs/DOCTOR.md) for behavior and options.

The root `test`, `typecheck`, and `check` commands explicitly include script
validation because workspace task filters exclude the repository root. Script
tests run without a task cache. Root Vite+ configuration registers the project,
and Knip declares tests and subprocess entrypoints explicitly; libraries remain
reachable through real imports so unused modules are still detected.

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
`lib/logger.ts` for consumer phase summaries; leave child-process output intact.
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
