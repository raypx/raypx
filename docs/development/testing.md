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
do not flood the terminal or an agent context. If a gate fails, `vmx` reports a
sanitized tail of that command's output. Use `bun run verify --verbose` when
interactive debugging needs the full live output.

Installation builds `@voidmix/shared` once because its public exports resolve
from `packages/shared/dist`. The root `dev` command runs the shared pack watcher
alongside applications. Turbo builds shared before consumer checks and tests, including focused
`vmx tasks` filters. Direct leaf commands bypass that graph: after editing shared,
run `bun run --cwd packages/shared build` before a workspace's direct `check` or `test`.

| Stage          | Command                                                       | Purpose                                       |
| -------------- | ------------------------------------------------------------- | --------------------------------------------- |
| i18n / policy  | in-process                                                    | cheap source and structural checks            |
| format         | `vmx tasks format:leaf`                                       | one repository-wide format check              |
| lint           | `vmx tasks lint:leaf`                                         | one type-aware lint pass                      |
| check          | `vmx tasks check`                                             | per-workspace typechecks; builds shared first |
| unit/component | `vmx tasks test:unit test:component --filter '!@voidmix/e2e'` | disjoint deterministic cached layers          |
| integration    | `vmx tasks test:integration --filter '!@voidmix/e2e'`         | uncached API/adapter checks                   |
| build          | `vmx tasks build`                                             | graph-owned checks and output restoration     |
| worker runtime | `node apps/worker/dist/index.mjs --check`                     | uncached compiled imports and resource probe  |
| runtime        | in-process Node probes                                        | uncached Web/API HTTP smoke checks            |

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
Its first reports are not a release gate because Nitro/Tauri entrypoints,
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

There are two job definitions (three runners):

- `typescript` uses Ubuntu 24.04 and one disposable PostgreSQL 17 service. It runs
  `bun run verify`, Drizzle generation, real database tests and Chromium E2E.
  It also builds the Worker image and runs real Chinese document exports with
  network disabled, exercising the fixed LibreOffice/Poppler/font dependencies.
  Database and browser tests run sequentially against the same test database;
  each suite resets its fixtures. The final clean-tree check catches both changed
  tracked files and newly generated untracked files, including route/Drizzle drift.
- `desktop` builds native packages on macOS and Windows, retaining the Rust cache.
  Tauri's `beforeBuildCommand` prepares the pinned native runner resources uncached,
  then enters `build:desktop`, which checks and builds the frontend through Turbo. Its Vitest
  tests run once with all other workspace tests in the Linux verification job.

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

`bun run test:e2e` starts API, Web and Desktop preview servers itself.
It runs the `cloud`, `web`, `admin`, `authenticated`, `redesign`, `homepage`, `workbench` and `desktop` projects. Configure the
dedicated database as described below. Set `VOIDMIX_E2E_PORT` to
choose the Web port (default 3000); Desktop uses +1 and API +2. The retired Project Studio suite and its
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
cd apps/desktop/src-tauri
cargo fmt --check
cargo check
cargo clippy --all-targets -- -D warnings
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
bun run vmx tasks test --filter @voidmix/scripts
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
of server and library checks. E2E uses separate Web, Admin, authenticated and Desktop projects;
Web/Admin target the Web server, while Desktop targets its own browser preview.

Run a single browser project or inspect its report with:

```bash
bun run --cwd e2e e2e -- --project=web
bun run --cwd e2e e2e -- --project=admin
bun run --cwd e2e test:report
```

## Acceptance expectations

- Browser, Node, React library, and Bun-specific types do not leak across
  workspace boundaries.
- Web and Desktop share contracts/client types but not route trees; Admin routes
  belong to Web's generated route tree.
- Ordinary users cannot access protected Admin procedures.
- Admin writes produce audit records and enforce self/final-admin protections.
- Settings administration RPCs are retired. Adapter tests still cover partial
  mutations, inherited defaults, secret redaction, no-op auditing and parity.
  API tests preserve dynamic registration/domain/email-policy guards.
- The unauthenticated Auth capability procedure returns only three booleans;
  public registration and tokenless reset UI follows them, fails open on request
  failure, and keeps existing reset-token flows usable.
- Settings tests distinguish omission (retain), `set`/`replace` (database
  override), and `reset` (delete and inherit), including secret redaction and
  source transitions.
- Missing production mail configuration leaves health and login available while
  mail-dependent Auth operations return `MAIL_NOT_CONFIGURED` with HTTP 503.
- Database scripts are tested against disposable development/test data.
- CI builds Web/API on Linux and Desktop packages on macOS and Windows.
- CI runs all Vitest layers once through `verify`; focused layer and coverage
  commands remain available locally.
- CI runs real PostgreSQL tests followed by Web, Admin and Desktop Playwright
  tests in the same Linux job after installing Chromium.

## Real database and authenticated browser gates

PostgreSQL 17 runs independently of the four identical Vitest layer commands:

```bash
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/voidmix_local_test bun run test:postgres
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/voidmix_e2e_test bun run test:e2e
```

Both require an explicit dedicated database named `voidmix_*test`; missing or
unsafe configuration fails. Each suite applies committed migrations and resets
its own fixture data. Never point these commands at development or production
data. Use separate databases when running both simultaneously. CI supplies one
PostgreSQL 17 service for the sequential Linux database and browser tests. `VOIDMIX_E2E_PORT` reserves Web/Desktop/API on three
consecutive ports for concurrent local development.

Database coverage includes Core/SQL visibility parity, keyset pagination,
administrator concurrency, rollback and idempotence. Authenticated Playwright
uses real Better Auth credentials and API/DB services for project creation,
tasks, Admin filtering/status updates, SSR isolation, refresh/history and errors.
No actor-header authentication bypass is enabled.
