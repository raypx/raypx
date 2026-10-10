# Raypx Testing & Checks

Vite+ 1.1.0 provides Vitest 5.0.3 and Oxlint 1.87.0, coverage uses same version `@vitest/coverage-v8`.
Project commands started by Bun; Vite+ and Vitest currently still run through Node tool entrypoints, not migrated to Bun native test framework.
Use `bun run test` to execute package script, `bun test` calls another runner, not this project's acceptance command.
All test APIs explicitly import from `vite-plus/test`. Root `vite.config.ts` declares projects and coverage,
each package configures its own unit test directories and environment. UI also has a dedicated browser Vitest configuration for Storybook.
Runtime package `tsconfig.test.json` checked by tsc for source, tests, and Vite configuration, sets noEmit;
test in filename indicates check scope, not Vitest runtime configuration. Static presets come from `@raypx/config/tsconfig/*.json`.
There is no separate active `tsconfig` workspace; `config` tools continue with real tests.

## Test Layers

| Project     | Environment              | Validation Content                                                                                           |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `contracts` | Node                     | Health check contract accepts valid data and rejects missing or incorrect fields                             |
| `client`    | jsdom + Testing Library  | HTTP contracts, timeout/cancellation/retries; React query sharing, auth transitions, and isolated clients    |
| `ui`        | jsdom + Testing Library  | Component semantics, status states, and debounce cleanup (20 unit tests)                                     |
| `api`       | Node                     | Health check Response, contract, and JSON 404                                                                |
| `web`       | Node runner, Bun service | After building Bun preset artifacts start with Bun, verify SSR, static assets, HTTP interfaces, and page 404 |
| `config`    | Node                     | Dependency boundaries, transitive cache input, public entrypoint aliases, and style sync                     |

Empty skeletons do not write placeholder tests; after adding real capabilities, configure corresponding test tasks.
Test directories use `test/` or `*.test.ts`, `*.spec.ts` in `src/`, React packages also support TSX.
Unit tests use public package entrypoints via precise aliases corresponding to source, watch does not need to pre-compile runtime packages.

## Commands

```sh
bun run test
bun run test:watch
bun run test:coverage
bun run vp run @raypx/contracts#test
bun run vp test run --project client
```

`bun run test` prepares build artifacts via task dependencies. `bun run test:coverage` first builds, then runs all tests.
`bun run test:watch` excludes `production.test.ts` and `runtime-features.test.ts`, avoids starting production process on every source change.
When running `vp test` directly in root directory, first execute `bun run build`, or explicitly exclude production tests:

```sh
bun run vp test run --exclude "**/production.test.ts" --exclude "**/runtime-features.test.ts"
```

Production integration tests use independent idle port, wait for real health check readiness before verification, and stop process at end,
does not depend on dev server or fixed port 3000.

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
Coverage includes application and package TS/TSX source, excludes auto-generated Start route tree.
No coverage threshold currently set; prioritize covering real contracts, request errors, and interaction paths.
Nitro service in independent subprocess not counted in Vitest unit test coverage, cannot equate integration test pass with complete source coverage.

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

CI installs Bun 1.4.2 from `.bun-version`, uses Node.js 22.21.1 from `.node-version` for toolchain compatibility.
First runs `bun run check:env` without dependencies, then uses `bun install --frozen-lockfile` to install per `bun.lock`, runs `bun run check`, installs Chromium, and executes `bun run storybook:test`.
Check first builds to generate routes, then checks format, lint,
package boundaries, types, and tests. Currently does not connect remote cache, coverage upload service, or external accounts.

Before installation and public root script pre hooks both call same environment check, requires actual Node.js 22.21.1, Bun 1.4.2 in PATH,
checks available package manager identifier, `devEngines`, version files, `packageManager`, and `engines.bun` consistency.
Bun 1.4.2 itself does not enforce `devEngines`, this engineering check reports actual vs expected values on mismatch and exits non-zero,
does not auto-download or switch tools. Development still needs Node toolchain, production service still run by Bun.

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
