# Raypx Testing & Checks

Vite+ 1.1.0 provides Vitest 5.0.3 and Oxlint 1.87.0, coverage uses same version `@vitest/coverage-v8`.
Project commands started by Bun; Vite+ and Vitest currently still run through Node tool entrypoints, not migrated to Bun native test framework.
Use `bun run test` to execute package script, `bun test` calls another runner, not this project's acceptance command.
Vitest APIs explicitly import from `vite-plus/test`; Playwright suites use `playwright/test`.
Root `vite.config.ts` declares projects and coverage,
each package configures its own unit test directories and environment. Root engineering
tests use the separate `scripts/vite.config.ts` project. UI also has a dedicated browser Vitest configuration for Storybook.
Runtime package `tsconfig.test.json` checked by tsc for source, tests, and Vite configuration, sets noEmit;
test in filename indicates check scope, not Vitest runtime configuration. Static presets come from `@raypx/config/tsconfig/*.json`.
There is no separate active `tsconfig` workspace; `config` tools continue with real tests.

## Test Layers

| Project               | Environment                           | Validation Content                                                                                                  |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `contracts`           | Node                                  | Health check contract accepts valid data and rejects missing or incorrect fields                                    |
| `client`              | jsdom + Testing Library               | HTTP contracts, timeout/cancellation/retries; React query sharing, auth transitions, and isolated clients           |
| `ui`                  | jsdom + Testing Library               | Component semantics, status states, and debounce cleanup (20 unit tests)                                            |
| `api`                 | Node                                  | Health check Response, contract, and JSON 404                                                                       |
| `web`                 | Node runner, Bun service              | After building Bun preset artifacts start with Bun, verify SSR, static assets, HTTP interfaces, and page 404        |
| `config`              | Node                                  | Dependency boundaries, transitive cache input, public entrypoint aliases, and style sync                            |
| `scripts`             | Node runner, Bun subprocesses         | Bin bootstrap, doctor diagnostics, CLI options, Knip entrypoints, locked dependency graphs, and process cleanup     |
| Application E2E       | Chromium, dev and built Bun service   | Hydration, navigation, themes, form/toast, dialog focus, health recovery, and 404 navigation                        |
| Independent consumers | Node, Bun, TypeScript, Vite, Chromium | Public compiled exports, optional React isolation, migrations, declarations, CSS, and browser dependency boundaries |

Empty skeletons do not write placeholder tests; after adding real capabilities, configure corresponding test tasks.
Test directories use `test/` or `*.test.ts`, `*.spec.ts` in `src/`, React packages also support TSX.
Unit tests use public package entrypoints via precise aliases corresponding to source, watch does not need to pre-compile runtime packages.

## Commands

```sh
bun run test
bun run test:watch
bun run test:coverage
bun run test:scripts
bun run typecheck:scripts
bun run raypx --help
bun run raypx consumer --kind core
bun run vp run @raypx/contracts#test
bun run vp test run --project client
bun run check:unused
bun run check:consumer
bun run test:e2e
bun run test:consumer:browser
```

`bun run test` prepares workspace build artifacts via task dependencies and then runs
the root script project. `bun run test:coverage` first builds, then runs all tests.
`bun run test:scripts` runs `scripts/test/**/*.test.ts` through Vite+/Vitest in Node,
including the lock/process regressions previously invoked by consumer acceptance
and unified bin help/invalid-option checks that must finish before preparation or
fixture creation. Bootstrap tests use dependency-free temporary checkouts to
verify root help/version, environment checks, setup idempotence, and Bun invocation
through symbolic links. Doctor keeps its own JSON, redaction, and exit-code checks.
It does not run the independent consumer installation or Playwright suite. Script
tests remain uncached because they exercise repository tooling and subprocesses.
`bun run test:watch` excludes `production.test.ts` and `runtime-features.test.ts`, avoids starting production process on every source change.
When running `vp test` directly in root directory, first execute `bun run build`, or explicitly exclude production tests:

```sh
bun run vp test run --exclude "**/production.test.ts" --exclude "**/runtime-features.test.ts"
```

Production integration tests use independent idle port, wait for real health check readiness before verification, and stop process at end,
does not depend on dev server or fixed port 3000.

Application E2E lives separately from Vitest and runs the same Chromium scenarios
against development and production. Each suite starts its own loopback server on
an available port, uses synthetic configuration with providers disabled, and cleans
up its processes even on failure. The development `e2e` mode disables Vite env-file
loading; production uses Bun's `--no-env-file`. Health failure/recovery is injected
through Playwright routing, without adding test routes to the application.

Independent consumer acceptance copies public build outputs and tool assets into
temporary directories outside the repository. It installs its own dependency tree,
checks locked dependency versions, and never uses workspace source aliases or links
to the repository's dependencies. Native Node/Bun smoke tests exercise SQLite
migrations; strict NodeNext/Bundler TypeScript consumers validate declarations.
The React-free core fixture omits React peers, while the browser fixture supplies
its peers explicitly and compiles Tailwind against the installed UI package.

`check:consumer` delegates to `raypx consumer` and includes runtime, type, and
browser-build checks. Consumer commands validate arguments before checking the
environment, building shared artifacts, and checking script types. Help does not
run these preparation steps. Browser interaction
checks run through `test:consumer:browser`; the full root `check` includes the static
consumer checks and Knip, while browser suites remain separate commands. Root tool
sources and consumer/Playwright configuration also receive TypeScript checking
through `scripts/tsconfig.json`. The root `typecheck`, `test`, and `check` commands
include script checks explicitly; the `@raypx/*` workspace filter excludes root
tools. `packages/config` checks and tests its own tools only. See the
[scripts guide](scripts/README.md) for entrypoints, libraries, and test ownership.

## Writing Tests

```ts
import { expect, test } from "vite-plus/test";
import { healthResponseSchema } from "@raypx/contracts/health";

test("accepts the health response", () => {
  const result = healthResponseSchema.safeParse({
    status: "ok",
    service: "raypx-api",
  });
  expect(result.success).toBe(true);
});
```

Use `vi.stubGlobal`, `vi.spyOn`, or dependency injection to control HTTP responses, restore mocks after tests.
Use controllable AbortSignal or fake timers to verify timeout, do not wait real 5 seconds; also verify default duration, external cancellation, and unmount cleanup.
Client React and UI hooks use `renderHook`, `act`, and `waitFor` to test observable state, do not depend on internal state variables or request count details.
Use a fresh QueryClient for each test and verify request/cache sharing, auth
cache clearing, and independent SSR clients. UI verifies through user-visible roles, text, and interactions, avoid only asserting implementation structure.

Server pure handler functions can directly import in Node unit tests; HTTP routing and framework integration separately covered by production tests.
Tests must not access real model services or production databases; when integrating in future, control external dependencies in test environment.

## Coverage & Static Checks

Report outputs to root `coverage/`, includes `index.html`, text summary, and `coverage-summary.json`.
Coverage includes application and package TS/TSX source plus `scripts/lib/**/*.ts`,
excludes auto-generated Start route tree.
The include patterns support both repository and selected project roots, so
`bun run vp test run --project scripts --coverage` also reports script libraries.
No coverage threshold currently set; prioritize covering real contracts, request errors, and interaction paths.
Nitro service in independent subprocess not counted in Vitest unit test coverage, cannot equate integration test pass with complete source coverage.
Doctor's Bun probes and consumer subprocesses likewise run outside Node's unit
coverage collection; their acceptance results verify behavior separately.

```sh
bun run check:env
bun run format:check
bun run lint
bun run check:boundaries
bun run typecheck
bun run check
```

Oxlint checks type-related Promise usage, React Hooks, JSX accessibility, and focused tests, warnings fail check.
Lint/fmt uses Vite+ `vp lint`, `vp fmt`, actual configuration follows root `vite.config.ts`; preserved `.oxlintrc.json` is unadopted alternative configuration, current vp scripts do not use it.
tsc executes complete type checking; Bun's TypeScript execution does not replace this step.
`bun run check:boundaries` uses existing TypeScript AST boundary script, complete `bun run check` also executes it, covers dependency directions, cycles, public exports, and illegal cross-package imports,
prohibits browser sources referencing Node built-ins or `bun`, `bun:*` built-ins;
checks every client core module for React imports and paths/reexports into its
React adapter, keeps Start-specific dependencies in web, and enforces
`client → contracts` with no business workspace dependencies in UI;
Start build verifies actual client import graph server isolation.

## CI & Migration Acceptance

CI installs Bun 1.4.2 from `.bun-version`, uses Node.js 22.22.1 from `.node-version` for toolchain compatibility.
First runs `bun run check:env` without dependencies, then uses `bun install --frozen-lockfile` to install per `bun.lock`, runs `bun run check`, installs Chromium once, and executes Storybook, application E2E, and independent consumer browser tests.
Check first builds to generate routes, then checks format, lint,
package boundaries, unused code/dependencies, types, tests, and independent consumers.
On browser failure CI uploads Playwright reports, traces, and screenshots; local
reports live in ignored `playwright-report/` and `test-results/` directories.
Currently does not connect remote cache, coverage upload service, or external accounts.

Before installation and public root script pre hooks both call the same environment check,
which requires stable Node.js `>=22.22.1 <23.0.0` and exactly Bun 1.4.2 in PATH.
`devEngines.runtime.version` declares `^22.22.1`; `.node-version` keeps 22.22.1
as the recommended and CI version. Node.js 22.23.3 passes; older releases, other
major versions, and prereleases fail. The broader root `engines.node` range
declares tool compatibility rather than development requirements.
The check validates the available package manager identifier, `devEngines`, version
files, `packageManager`, and `engines.bun` consistency.
Bun 1.4.2 itself does not enforce `devEngines`, this engineering check reports actual vs expected values on mismatch and exits non-zero,
does not auto-download or switch tools. Development still needs Node toolchain, production service still run by Bun.

The root `.vite-hooks/pre-commit` runs `bun run staged`, which validates the
development environment before Vite+'s native `vp staged`. Root `vite.config.ts`
owns non-overlapping staged rules: code files run `vp check --fix` for formatting
and lint fixes (including failing on warnings); supported configuration, documentation,
and style files run formatting. Generated artifacts retain the root lint/format
ignore rules. Successful fixes are staged automatically, and partially staged
files retain their unstaged changes. The hook performs no full-workspace `tsc`
or tests; run `bun run check` for complete acceptance. Installation uses
`prepare`, and `.vite-hooks/_/` is generated locally and ignored by Git.

After engineering modifications, verify by impact:

- After clean install, root commands can start development and production services.
- Homepage SSR, browser hydration, connection check, and retry after failure remain normal.
- Health response satisfies public contract, unknown API returns JSON 404, static assets and page routing correct.
- Mistakenly importing server packages from client fails, browser artifacts do not contain server configuration.
- Repeated builds hit cache, recover after deleting output, consumers rebuild when underlying packages change.

When adding features, prioritize supplementing success, failure, cancellation, and resource cleanup paths; keep tests independent, run checks related to changes.

## Feature acceptance

The application integration suite executes the built server with Bun and a
temporary migrated database. It verifies production secure cookies, registration,
session projection, renewal, signout/revocation, configured origin rejection,
readiness resources, authenticated Prometheus export, and 429 headers/contracts.
Node and Bun database paths also have real SQLite lifecycle, migration, FK,
transaction rollback, and authentication tests.

Storybook uses Chromium with the same Tailwind plugin and semantic styles as
the component preview. All 118 stories run with accessibility failures enabled;
keyboard, focus, nested portals, and pagination use play functions.

Request boundary tests cover actual byte limits, JSON media types, read deadlines,
abort propagation, and safe 408/413/415 contracts. Streaming tests cover backpressure,
EOF/error/cancellation, observer isolation, and concurrent request/log context.
Built-server tests verify those boundaries through the auth adapter and real Bun
connections. Response-finished means the application's body was consumed or ended;
it is not confirmation that every byte reached the remote client.

Doctor tests use synthetic repositories and configuration. They verify first-install
diagnostics, environment precedence, opt-in read-only probes, output redaction, and
that default diagnostics do not open databases or issue network requests. Knip
recognizes public exports and documented dynamic framework/tool entrypoints;
exceptions are narrow rather than treating all source files as entrypoints.
