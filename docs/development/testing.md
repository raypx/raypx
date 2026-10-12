# Testing and Verification

## Standard verification

```bash
bun install --frozen-lockfile
bun run verify
```

`verify` is the gate, and the list below is what it contains, in order. Each
stage is cheaper than the one after it, so the first failure is usually the
fastest one to reproduce:

`bun run verify` captures child-process output by default, so successful checks
do not flood the terminal or an agent context. If a gate fails, `rpx` reports a
sanitized tail of that command's output. Use `bun run verify --verbose` when
interactive debugging needs the full live output.

Installation builds `@raypx/shared` once because its public exports resolve
from `packages/shared/dist`. The root `dev` command runs the shared pack watcher
alongside applications. Turbo builds shared before consumer checks and tests, including focused
`rpx tasks` filters. Direct leaf commands bypass that graph: after editing shared,
run `bun run --cwd packages/shared build` before a workspace's direct `check` or `test`.

| Stage          | Command                                                     | Purpose                                       |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| i18n / policy  | in-process                                                  | cheap source and structural checks            |
| format         | `rpx tasks format:leaf`                                     | one repository-wide format check              |
| lint           | `rpx tasks lint:leaf`                                       | one type-aware lint pass                      |
| check          | `rpx tasks check`                                           | per-workspace typechecks; builds shared first |
| unit/component | `rpx tasks test:unit test:component --filter '!@raypx/e2e'` | disjoint deterministic cached layers          |
| integration    | `rpx tasks test:integration --filter '!@raypx/e2e'`         | uncached API/adapter checks                   |
| build          | `rpx tasks build`                                           | graph-owned checks and output restoration     |
| worker runtime | `node apps/worker/dist/index.mjs --check`                   | uncached compiled imports and resource probe  |
| runtime        | in-process Node probes                                      | uncached Web/API HTTP smoke checks            |

Nothing else needs to be run in sequence. The remaining scripts narrow a failure
down: `bun run policy` prints each finding with a `Fix:` line and
`bun run policy:fix` applies the ones with a single possible remedy, `bun run
format:fix` rewrites in place, and a workspace's own `AGENTS.md` names its
narrowest check and test.

Three commands stay outside `verify` on purpose. `bun run test:postgres` needs a
dedicated PostgreSQL 17 test database; `bun run test:e2e` needs a separate test
database and Playwright browser. `bun run doctor` asserts machine prerequisites,
which is not something CI can assert about itself.

`bun run knip:report` is also a separate advisory check. Knip finds unused
files, exports, dependencies, and duplicate exports across the workspace graph.
Its first reports are not a release gate because Nitro/Electrobun entrypoints,
dynamic imports, package public exports, and environment-backed build configs
need explicit classification in [`knip.json`](../../knip.json). Once that
baseline is clean, dependency and duplicate-export findings can be promoted to
the verification gate independently.

## GitHub Actions

[CI](../../.github/workflows/ci.yml) runs automatically on pull requests and pushes
to `canary`, and can also be started with **Run workflow**. It needs no repository
Secrets, Variables, `.env` file, or external database. Optional Turbo secrets
enable signed remote cache only on trusted canary pushes/manual runs; PRs use
local-only caches. Missing remote credentials never prevent verification. Node and Bun versions come
from the root `package.json`; dependencies use the frozen lockfile.

There are three job definitions (six runners):

- `typescript` uses Ubuntu 24.04 and one disposable PostgreSQL 17 service. It runs
  `bun run verify`, Drizzle generation and real database tests.
  It also builds the Worker image and runs real Chinese document exports with
  network disabled, exercising the fixed LibreOffice/Poppler/font dependencies.
  Its database suite resets only its dedicated test fixtures. The final clean-tree
  check catches both changed
  tracked files and newly generated untracked files, including route/Drizzle drift.
- `e2e` runs two Web shards and one Desktop runner alongside TypeScript verification.
  Each runner has a separate PostgreSQL 17 database, port range and failure report.
  Web includes the cloud business flows and starts only API/Web; Desktop starts
  only API/Desktop and seeds only accounts/projects. Each task builds its actual
  consumer applications; Worker is not an E2E dependency. All browser runners retain
  generated-file checks and the existing untrusted-PR cache policy.
- `desktop` builds Electrobun native packages on macOS and Windows. Root
  `desktop:build` checks/builds the frontend through Turbo, then runs the stable
  native packager. The pinned devkit is prepared before root lint and Desktop checks/Vite.
  Vitest tests run with all other workspace tests in the Linux verification job.

A newer push cancels the previous run for the same branch or pull request. Each
job has a 30-minute timeout. Browser failure reports and traces are uploaded for
seven days. The generate step uses a non-routable `DATABASE_URL`; it validates the
configuration without connecting to PostgreSQL. Only the database/browser test
step sets `NODE_ENV=test`, leaving production builds and runtime probes intact.

The disjoint unit/component/integration layers run once inside `verify`. Layer commands remain available
for focused local checks, and policy enforces their canonical substring filters;
CI does not repeat those layers again for coverage. Run
`bun run test:coverage` explicitly when a coverage report is needed (there is no
minimum coverage threshold). Knip remains a local advisory command, outside the
required pipeline, so its framework/config discovery cannot block verification.

`bun run test:e2e` runs both `web` and `desktop` projects and starts all three
servers. Use `bun run test:e2e:web` or `bun run test:e2e:desktop` to build and start
only API and the selected application. Cloud is part of Web coverage; the
cloud spec files retain their business assertions without a separate project.
Configure the dedicated database as described below. Set `RAYPX_E2E_PORT` to
choose the Web port (default 3000); Desktop uses +1 and API +2.
Scoped runs write reports to `playwright-report/<suite>` and results to
`test-results/<suite>`; the full run keeps the original report locations. The retired Project Studio suite and its
mock API fixture have been removed; Web still checks the sign-in redirect for
unauthenticated access to `/projects`.
Install the local browser once with:

```bash
bun run --cwd e2e playwright install chromium
```

CI installs Chromium and its Linux dependencies with the workspace-local
`bun run --cwd e2e playwright install --with-deps chromium` command before
running the browser tests in the Linux job.

Desktop native checks:

```bash
bun run --cwd apps/desktop check  # renderer, config and native TypeScript
bun run desktop:build            # root frontend gate, then native packaging
```

Each workspace must complete its local TypeScript check independently. The root
Turbo task graph runs checks, tests, and builds across all applications and
packages. Node deployments explicitly select `node-server`. After the
build, it reads each Web and API `.output/nitro.json`, requires the `node-server`
preset, and starts each generated server with the repository's Node runtime on
a temporary loopback port. One Web process must serve both `/` and `/health`;
the standalone API output must serve `/health` and reject an unauthenticated
`POST /internal/execution/bootstrap` with HTTP 401. A 404 fails the probe, so a
missing production route cannot pass as a healthy server. The probe supplies a
non-routable database URL and exercises no database query.

The Worker artifact check runs on Node 24.18.0 and needs no database or model
credentials. Document integration tests additionally exercise LibreOffice when
`SOFFICE_BINARY` is available, including an eight-page presentation and its real
PDF preview. Provider-backed Search/Computer acceptance needs the configured
model, search API and private bucket described in
[deployment](../architecture/deployment.md).

## Vite+/Vitest configuration boundary

Every application and test-bearing package owns a separate `vitest.config.ts`.
They share runner-only defaults through root `test.config.ts`; each workspace
keeps its own discovery, environment and setup overrides.
Each runner uses at most two workers because Turbo already runs workspaces in
parallel, and uses one on machines with at most two available CPUs. This bounds
nested process concurrency without relaxing test limits or disabling file isolation.
The test command is `vp test --run`, which reads that file; the application
`vite.config.ts` is reserved for `dev`, `build`, and SSR. Unit tests therefore
do not load TanStack Start, Nitro, React, Tailwind, or evlog application
plugins.

Loading the complete application plugin pipeline in Vite+'s test module runner
causes React 19's CommonJS entry to be evaluated as an inlined ESM module. The
visible symptoms are:

```text
ReferenceError: module is not defined
close timed out after 10000ms
```

**Every `vitest.config.ts` must stay.** Deleting one does not fall back to a
sane default — it lets the workspace's `vite.config.ts` plugin pipeline into the
runner, which is what produces the failure above. Do not reintroduce test-mode
branches into application Vite configs unless a specific plugin is genuinely
required by a test.

Run repository tests through:

```bash
bun run test
# or, for one workspace through the graph:
bun run rpx tasks test --filter @raypx/scripts
# or, directly inside a workspace:
bun run --cwd packages/scripts test
```

Do not rely on a globally installed `vp` binary. Even when its version matches
the repository's pinned release, its global install directory is a different
physical dependency tree from the workspace's `vite-plus/test` import. That splits the
runner from the test API and can fail before the first test with
`Cannot read properties of undefined (reading 'config')`. Workspace scripts are
safe because they resolve `vp` from the root `node_modules/.bin`, the same way
they already resolve `tsc` without declaring TypeScript.

`vp test` is Vite+'s built-in command and is the runner every workspace `test`
script calls. Turbo runs workspace scripts; `bun run test` is the repository-wide uncached
full-suite entry point, while focused unit/component runs use caches. There is no direct
`vitest` dependency: Vite+ bundles the runner, and the test API is imported from
`vite-plus/test`. `@vitest/coverage-v8` remains a direct dependency because
Vite+ does not bundle it; its version therefore has to keep matching the Vitest
that Vite+ ships.

The root `vitest.config.ts` excludes the Playwright `e2e/` workspace. It is a
file-discovery smoke config only: a root `bunx vp test --run` collects every
workspace's tests into one process, where per-workspace `setupFiles` and
environments do not apply, so `jest-dom` matchers are missing and jsdom stubs
such as `window.matchMedia` are absent. Expect failures from that invocation and
use `bun run test` for a real repository-wide run.

## Test layers

Tests are classified by filename so a workspace can run a focused layer without
loading another application's plugin pipeline:

| Layer       | File pattern               | Purpose                                                |
| ----------- | -------------------------- | ------------------------------------------------------ |
| Unit        | `*.test.ts(x)`             | Pure functions, contracts, repositories, and utilities |
| Integration | `*.integration.test.ts(x)` | API boundaries and in-memory adapters                  |
| Component   | `*component.test.ts(x)`    | React UI behavior in `jsdom`                           |
| E2E         | `e2e/tests/*.spec.ts`      | Browser smoke tests across running applications        |

`test:unit` selects its layer by excluding the other two patterns, while
`test:integration` and `test:component` select theirs with vitest's positional
argument. **That argument is a substring filter, not a glob.** A glob there
matches no file and still exits 0 under `--passWithNoTests`, which is how twelve
workspaces once ran zero integration and zero component tests while reporting
green. The four layer scripts are byte-identical in every workspace that owns a
`vitest.config.ts`; `bun run policy` holds them to that single form, and the form
itself lives in `packages/scripts/src/policy/manifests/rules.ts`. Change it there, then
run `bun run policy` for the paste-ready fix in each workspace.

Node workspaces use the Node test environment. DOM workspaces and individual
component/integration files opt into jsdom with local setup, keeping globals out
of server and library checks. E2E has Web and Desktop projects. Web covers
public, authenticated and cloud flows; Desktop targets its own browser preview.

The root E2E commands use `rpx e2e` to forward Playwright arguments through
Turbo. Select an application, a functional group, a file or a test title:

```bash
bun run test:e2e:web --group cloud --list
bun run test:e2e:web --group projects
bun run test:e2e:web tests/authenticated-web.spec.ts --grep "project creation"
bun run test:e2e:desktop --group smoke
bun run test:e2e:web --shard=1/2
bun run --cwd e2e test:report
```

`--list` lists the selected tests without builds, application servers, browsers
or database setup, so it needs no test database. Executing the tests still needs
the guarded database environment described below. Omitting `--group` preserves
the complete suite; file and `--grep` filters further narrow the selected group.

| Group       | Web specs                           | Desktop specs      |
| ----------- | ----------------------------------- | ------------------ |
| `smoke`     | `web`, `homepage`                   | `desktop`          |
| `projects`  | `authenticated-web`, `redesign`     | `desktop-redesign` |
| `workbench` | `workbench`                         | —                  |
| `cloud`     | `cloud`, `session-revocation-cloud` | —                  |

Every `tests/**/*.spec.ts` must belong to exactly one entry in
[`e2e/test-groups.ts`](../../e2e/test-groups.ts). Missing, stale and duplicate
registrations fail during config loading; selecting an empty application/group
combination also fails. Do not use `--pass-with-no-tests` to conceal a bad filter.

CI runs the complete Web suite in two shards and Desktop in one. Each runner
owns its checkout, PostgreSQL service, ports and report artifact; no tests are
removed from full regression. Group and shard reports use separate directories
under `playwright-report/` and `test-results/`. Shards split test counts rather
than measured durations, so equal counts do not guarantee equal runtime.

The `raypx/boundaries` Oxlint rule now owns source import diagnostics. Its
RuleTester cases live in `packages/scripts/src/lint/`; policy tests retain
manifest direction and complete dependency-cycle coverage. The two share one
architecture model rather than maintaining separate boundary rules.

## Acceptance expectations

- Browser, Node, React library, and Bun-specific types do not leak across
  workspace boundaries.
- Web and Desktop share contracts/client types but not route trees.
- Retired Admin and device/local execution RPCs return 404 for every role.
- Private Cloud and Project resources enforce account and capability isolation.
- Settings administration RPCs and unused writers are retired. Reader tests cover
  inherited defaults and secret redaction; API tests preserve dynamic
  registration/domain/email-policy guards and suspended-account denial.
- The unauthenticated Auth capability procedure returns only three booleans;
  public registration and tokenless reset UI follows them, fails open on request
  failure, and keeps existing reset-token flows usable.
- Settings readers retain database overrides, environment fallbacks and field
  sources without exposing credentials to clients.
- Missing production mail configuration leaves health and login available while
  mail-dependent Auth operations return `MAIL_NOT_CONFIGURED` with HTTP 503.
- Database scripts are tested against disposable development/test data.
- CI builds Web/API on Linux and Desktop packages on macOS and Windows.
- CI runs all Vitest layers once through `verify`; focused layer and coverage
  commands remain available locally.
- CI runs real PostgreSQL tests in the TypeScript job and Web/Desktop Playwright
  suites independently on separate Linux runners after installing Chromium.

## Real database and authenticated browser gates

PostgreSQL 17 runs independently of the four identical Vitest layer commands:

```bash
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_local_test bun run test:postgres
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_e2e_test bun run test:e2e
```

Both require an explicit dedicated database named `raypx_*test`; missing or
unsafe configuration fails. Each suite applies committed migrations and resets
its own fixture data. Never point these commands at development or production
data. Use separate databases when running both simultaneously. CI gives
PostgreSQL tests and each browser suite its own PostgreSQL 17 service. `RAYPX_E2E_PORT` reserves Web/Desktop/API on three
consecutive ports for concurrent local development.

Database coverage includes Core/SQL visibility parity, keyset pagination,
owner fencing, rollback and idempotence. Authenticated Playwright uses real
Better Auth credentials and API/DB services for project creation, tasks, Cloud
delivery and acceptance, SSR isolation, refresh/history and errors.
No actor-header authentication bypass is enabled.

For local parallel Web/Desktop runs, use separate checkouts, databases and port
ranges. Two browser commands in the same checkout can still race while rebuilding
shared output, even when their databases are separate.
