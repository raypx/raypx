# Validation scripts and generated evidence

Reusable repository checks live in `packages/dev-cli/src/validation/` and are
exposed through `raypx-dev`, which `@raypx/dev-cli` registers and implements.
Reusable build/task exports remain in Tooling.
Feature fixtures stay with their owning workspace's `tests/`; product code never
imports these tools. `.artifacts/` is ignored,
disposable output: logs, reports, screenshots, traces and generated comparisons.
Do not author or maintain scripts there. One-time migrations are removed after
verification; their generated evidence may remain until cleanup.

Root commands aggregate through `bun run test <suite>`; Dev CLI owns independent
`test:inventory`, `test:backends` and `test:sandbox` scripts. See [test commands](testing.md#test-commands).

## Build sizes

```sh
bun run size
bun run size --package cli --package web --require
bun run size --package desktop --native --require
bun run size --package desktop --browser --require
```

Build the selected packages first with the existing build commands. `size` never builds
or starts an application. It discovers buildable workspaces from manifests, omits
source-only libraries, and accepts repeated `--package` selectors by manifest name,
`@raypx/` shorthand or workspace path. Without selectors it snapshots all existing
build outputs, marking missing/empty outputs unavailable. `--require` fails when
any selected output is unavailable, after writing the evidence.

The reporter prefers Nitro `.output` over intermediate `dist`; other builds use
`dist`. Desktop measures the MyGo renderer at `dist/client`, with
`--browser` selecting its compiled browser fixture instead. `--native` adds each
production `.app`, Windows host executable, installer and updater archive under
`apps/desktop/build/{darwin,windows}-{arm64,amd64}/`. It excludes smoke/debug outputs and signature
sidecars. No installer is inferred from renderer-only or Go source checks.

Directories report the sum of regular-file bytes and file counts, including maps,
licenses and bundled dependencies. Symlinks are counted separately in JSON and are
not followed. This is logical payload size, not filesystem allocation or network
transfer size. Installer/archive rows report their actual compressed file sizes;
no synthetic gzip estimate is mixed into directory totals. CLI distributions also
show embedded CLI/Bun, Herdr and metadata/license components. Those components
are included in the CLI total; renderer, `.app`, installer and updater measurements
overlap and must not be added together.

Each invocation writes `.artifacts/sizes/<run>/sizes.json` (exact bytes, file counts,
status, platform/architecture and observation time) and `sizes.md`. These describe
the existing output snapshot; cached or older local artifacts are not a fresh build
of the current checkout. CI also records the workflow revision, appends the table to
the GitHub job summary, and uploads `build-sizes-*` report artifacts. Source verification
reports only packages in its executed build graph, including restored cache outputs;
source-only runs do not produce size rows. Browser gates measure their selected assets.
Native checks report the CLI payload, while distribution phases additionally report
the renderer and actual native packages. Size evidence does not establish platform
acceptance. The production packaging decision
defines the CLI payload; collect current measurements with these commands rather
than treating older migration outputs as a current baseline.

## Native check gates

Each selected native platform checks cross-platform process/task runners and the
installed CLI before Herdr and MyGo host checks. The CLI consumes the verified
immutable payload from the preparation job; acceptance never rebuilds it. The
prepared payload's size table appears in the job summary. CI attempts to upload
native acceptance JSON and size reports on success or failure and retains uploaded
reports for seven days. A report upload failure is logged and allowed on routine
runs. Distribution runs require successful uploads.
MyGo checks still run after an earlier acceptance failure when the shared payload
was verified and the workflow has not been cancelled; the failed gate still fails
the job. Routine runs select Windows; explicit macOS and distribution selections
retain their existing matrix.
Changes to the process/task runners, their acceptance tests, or the native workflow
also select Windows checks without requiring a Desktop source change. Planner-only
changes select Dev CLI source verification.

## Test inventory and preservation

```sh
bun run test inventory
bun run test inventory --layers
bun run test inventory --baseline .artifacts/tests/<previous-run>/inventory.json
```

Each invocation executes fresh tests with the configured toolchain, then writes a new
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
  "apps/web/src/features/example.component.test.tsx": "@raypx/tasks"
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
For automatic provisioning, provide PostgreSQL's `initdb`, `postgres`, `pg_isready`
and `createdb` on PATH, or set
`TEST_POSTGRES_BIN` to their directory. Redis's `redis-server` comes from PATH or
`TEST_REDIS_BINARY`. These are test prerequisites, not product dependencies;
provisioning is not part of default verify. Run as an ordinary user, as required
by `initdb`. Missing prerequisites fail before any service is started.

The default runs API Bun-hosted PostgreSQL and Redis tests. `--with-e2e` additionally starts the existing
isolated control API fixture and runs the complete browser suite against it; this
requires installed Playwright Chromium. It does not authorize external inference
or replace real HTTPS, packaged Native or Windows acceptance.
Playwright flags after `--` retain the normal browser launcher's selection rules;
use `--workers=1` on a busy machine. `VP_RUN_CONCURRENCY_LIMIT=1` likewise lowers
workspace-task concurrency for inventory or backend gates without changing assertions.

By default each run creates its own temporary data, loopback ports and random
SCRAM password. Inherited database/Redis URLs are replaced. To use an existing
disposable loopback database, pass `--database-url postgres://user@127.0.0.1:PORT/name_test_lane`.
The explicit URL must have a `*_test` or `*_test_<lane>` name and no query options;
PostgreSQL is neither provisioned, stopped nor reset in this mode. Redis remains
an owned temporary process.
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

## Owned sandbox real-Engine acceptance

```sh
bun run raypx-dev test sandbox
bun run raypx-dev test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" bun run raypx-dev test sandbox
# Explicitly authorizes temporary host firewall changes; Linux Engine host only:
bun run raypx-dev test sandbox --with-egress
```

Install repository dependencies with the pinned Bun and provide Docker CLI plus a
reachable Linux Engine supporting API v1.47 or later. Registry access and image
build internet access are required. The gate pulls the pinned Bun tag and
`python:3.13-slim-bookworm`, resolves their repository digests, then builds
`infra/sandbox/Computer.Dockerfile` using those immutable inputs for the Engine's
native Linux architecture, overriding inherited platform defaults. Base images and
build cache may remain cached. The resulting immutable Engine image ID selects
the locally built image without requiring publication to a registry.

Missing Docker or an unreachable Engine fails before state or services are
created. `--engine-socket` takes precedence over Unix `DOCKER_HOST`; otherwise the
default is `/var/run/docker.sock`. Every CLI call and the supervisor use that same
socket, irrespective of Docker contexts. TCP/SSH `DOCKER_HOST` is not used.

The gate starts the supervisor from source on a free loopback port with a random
dedicated token and temporary private state. It runs
`packages/providers/tests/computer/conformance.test.ts` with `RAYPX_TEST_DOCKER=1`,
then provisions its own probe computer through the supervisor. Engine inspection
and in-container probes check UID 1000, absent Docker sockets, read-only root,
configured memory/PID ceilings, zero effective capabilities, no-new-privileges,
the owned bridge network rather than host networking, and no bind mounts. A
snapshot followed by a greater generation must create a different container and
preserve a written home file.

`--with-egress` additionally applies [the operator ruleset](deployment.md#optional-computers)
when running on Linux as root or with passwordless `sudo`. The Engine bridge must
exist on that host and Docker must use its iptables backend; both `iptables` and
`ip6tables` are required. The probe compares public `1.1.1.1:443` with an independent
Engine-host control; network failure on both is unavailable. TLS or HTTP errors
fail acceptance. Bridge gateway TCP/80 and `169.254.169.254:80` must time out;
refused connections or routing errors alone cannot prove these restrictions. These bounded checks do not demonstrate
every private address/port is blocked; the static ruleset test covers generated
ranges. Public IPv6 is denied by the ruleset. Without the flag, or on a host without
the supported OS/privilege combination, egress probing is reported as not run. A
supported opted-in apply/probe failure fails the gate. macOS/Colima firewall rules
belong inside the Linux Engine VM. Set `--engine-host-command` to an explicit
JSON argv prefix for root commands there, with the checkout mounted at the same
absolute path. Apply, counter reads and removal all use that prefix. The gate
owns a host-network canary for loopback and service isolation, independent of the
supervisor location. `--dns-resolver` selects the shared public IPv4 upstream.
Both direct and embedded UDP/TCP DNS are checked; alternate resolvers, metadata
and RFC 1918 destinations require timeouts and increasing owned DROP counters.
IPv6 enforcement is unavailable without a reachable host control; a reachable
control additionally requires a timeout and increasing IPv6 DROP counter.

Every run uses a unique supervisor namespace and labels. On success, failure or
handled interruption, it stops the supervisor before removing only its labeled
containers, anonymous helper volumes, labeled home volumes, network, built image
and temporary state; it removes any firewall rules it attempted to apply.
Cleanup failures fail the gate. There is no global prune. An uncatchable process
or machine termination can leave resources; the run ID in evidence identifies
their exact labels for operator cleanup.

One line per step reports progress. `.artifacts/sandbox/<run>/` retains protected
logs, `commands.json` timings/exit codes and `results.json` with run identity,
platform, Engine version/architecture/API, resolved base digests, built image ID
and result. No token, command
environment or argv is recorded. Review raw test logs before sharing. Source-only
`verify` never invokes this gate. CI selects the Ubuntu job for sandbox sources,
Computer provider/conformance inputs and sandbox acceptance/deployment inputs,
or full/manual/tag plans. The artifact is uploaded on success or failure. A root
lockfile change or missing Git base alone does not request Docker acceptance.

On 2026-11-14 the gate passed on macOS arm64 with a Linux arm64 Engine VM
(29.5.2, API 1.54): provider conformance 10/10, isolation, home replacement and
IPv4 restricted egress. Public HTTPS and configured direct/embedded UDP/TCP DNS
succeeded; private, metadata, gateway, host-service and alternate-DNS probes
timed out with increasing owned DROP counters. IPv6 enforcement was unavailable
because the VM disables IPv6. Native Linux distributions, amd64, Windows, other
Engine configurations and rootless acceptance remain unverified.

## Deployment images

```sh
bun run smoke:deployment
bun run smoke:deployment --platform linux/arm64
```

Docker with Buildx must be available. The default target is `linux/amd64`; foreign
architectures require Docker's emulation support. Builds run sequentially in an
owned builder capped at two CPUs and 3 GiB RAM. The command builds the Compose
migration/API/Web images, Railway API/Web images and the Caddy gateway. The smoke
builds use the original Dockerfiles and matching application build arguments so
Railway reuses the Compose dependency and compilation layers.
API's `deployment:fixture:build` bundles the synthetic account provisioner once into
the evidence directory. The gate mounts it read-only into the prepared Bun migration
image on the internal network; it neither exports an API development image nor
publishes a database port. API/Web assertions are shared with relocated artifact probes.

Each run creates its own internal backend and gateway ingress networks, tmpfs PostgreSQL and nonpersistent Redis, using
synthetic credentials and an `example.invalid` account. Mail verification runs
through an in-process fixture mailer without delivery. Both profiles execute real
migrations, readiness, SSR/assets, login/session, secure cookie attribute and Relay
checks; Railway also checks Redis readiness and IPv6 binding. Release metadata must
match the version embedded during the build. The gateway publishes only on loopback.
This checks proxy/session behavior over local HTTP; real public HTTPS, delivery,
Railway infrastructure and packaged Native acceptance remain separate gates.

No operator env file, existing database or volume is selected. Containers, networks,
builder and tagged test images are removed on success, failure or handled interruption;
base images may remain cached. `.artifacts/deployment/<run>/` retains protected
command logs plus `commands.json` and `results.json`. In GitHub Actions the image
builds stream plain BuildKit progress to the job log. Manifests contain labels,
exit codes and timings, never command arguments or environment values.

CI calls this command through `container-smoke` only for Dockerfiles, `.dockerignore`,
deployment adapters/source staging, image acceptance scripts/fixtures or its reusable
`.github/workflows/container-smoke.yml`,
and for manual runs and release tags. Ordinary application code, dependencies and
application build configuration do not select it. An unavailable Git base broadens
source/native checks without requesting container builds. These temporary images stay
on the CI runner; Railway owns the production build and deployment after CI passes.
The main workflow passes its plan to this reusable worker; changing orchestration or
display names in `ci.yml` does not by itself request container builds.

## Verification planning and cache

Root `turbo.json` declares task dependencies, inputs, outputs and environment keys;
Dev CLI's `src/turbo.ts` launches Turbo and reads each run's summary. Workspace
discovery, Git change reading and reverse propagation live in Dev CLI's private
`src/repo/`; Raypx supplies native scope policies. The Start environment adapter is
Tooling's `./build/start-env`, with injected Vite `loadEnv`.

Use `bun run verify` for daily feedback: policy and locales are always selected as
Turbo root tasks; unchanged inputs reuse successful results. Their explicit source,
manifest, document and catalog patterns cover added and deleted files. Policy/locales
share the source task run, avoiding extra launches. Verification prints and records
their execution times from Turbo's run summary (zero when cached), format/lint wall
times and the Turbo wall time including launcher overhead.

A broad change (shared inputs or `--full`) lints the whole repository as the cached
`//#lint` Turbo task, so an unchanged tree restores it; a narrow change lints only its
own files directly. Lint runs type-aware rules without its own type check; TypeScript diagnostics come
from the cached workspace checks and the root `types` task, which checks every
workspace's Vitest configuration.
Changed files select formatting/lint and affected workspace types through reverse
dependency graphs. Local test selection follows transitive source imports and changed
test files, retaining affected integration suites and filesystem/subprocess assertions.
Indirect consumers run complete suites. Configuration, fixtures, deletions, unresolved
imports or sources without a test dependency fall back to complete suites. Test arguments
go to that package's own Turbo invocation and participate in its cache key.
CI and `--full` run complete suites for selected workspaces. Native inputs independently select Go host tasks.
The default base is the merge-base with `origin/canary`; staged, unstaged,
untracked, renamed and deleted files count.
Use `--base <ref>` to change it or `--dry-run` to inspect the JSON plan and its
resolved baseline SHA. Root guides such as `DESIGN.md` and `CONTRIBUTING.md`
receive repository checks without selecting workspace suites on their own.
Unknown inputs, shared JS configuration/lockfiles, or an unavailable base broaden
source checks to all workspaces. This does not request release builds, Knip, browser
acceptance or database jobs. An unavailable Git base also selects native checks
conservatively because the native inputs are unknown. `bun run knip` remains an
explicit maintenance command.
Go-only changes (Go sources and the Desktop module's `go.mod`/`go.sum`) select host
checks without selecting renderer type checks or JavaScript suites. Workflow files
and the `native-checks` action select Tooling's type checks/tests plus any relevant
native/container acceptance. Shared dependency-install/cache actions still broaden
all source checks. Mixed changes combine these scopes, and full verification selects
every workspace as before.
A workspace's tests, `*.test.*`/`*.spec.*` files and Vitest configs select only
that workspace, unless its package exports point into `tests/`.
Dev CLI policy, validation, verification and test edits select only Dev CLI; its
command, repository and test-runner modules retain all source checks. Tooling tests
select only Tooling. Exported Tooling implementation follows its entry's transitive
source dependencies and actual workspace imports, then propagates to downstream
consumers. Changes to task machinery, unknown/deleted Tooling inputs or unresolved
public graphs retain all source checks.
Changes to the API relay fixture or its helper select the CLI task lifecycle test
locally and the CLI suite in CI. The CLI test cache fingerprints both fixture files.
Source checks follow transitive workspace dependents. The CI backend gate follows API
inputs and its direct manifest runtime dependencies. API PostgreSQL, Redis and cluster
suite edits and shared backend fixture changes also select that gate, including in a
push with shared configuration changes. Login, password setup and remote approval
source changes run the relevant Web or Desktop browser smoke. App-owned `e2e/`
changes run that app's full browser suite, and shared E2E changes run both full
suites. A full suite takes precedence over smoke for the same project. The plan
summary shows the comparison baseline SHA, the input paths that selected each
browser project, the selected native runners, and whether source tests, native
distribution, backend integration and container smoke were selected.

Use `bun run verify --full` for release preparation or an explicit full check. It checks all JS and current-platform
Go host targets, builds outputs and runs independent artifact probes concurrently.
It needs no GUI, database or mail service. Linux CLI artifact acceptance requires
Docker unless the process already runs in a loopback-only network namespace;
it executes the prepared payload with `--network none`. This is separate from
the `container-smoke` gate. The repository uses Bun for JavaScript
and Go 1.27.3 for Desktop. `verify` and `verify --full`
are the verification entry points.

GitHub uses the same change planner:

`verification/index.ts` owns the local command, `plan.ts` owns task selection and
`execution.ts` runs the selected tasks through Turbo. `verification/ci.ts` adapts GitHub events
and dispatches workers. Deployment acceptance and artifact probes load only when
their command or stage is selected.

Jobs use short lowercase IDs with hyphens between words and explicit sentence-case
display names describing their purpose. Matrix names include the runner or platform;
reusable native jobs use phase labels: **Prepare artifacts**, **Checks**,
**Packaging** and **Smoke**. The final `foundation` job appears as **CI result**.

Each CI run appears as **Verify** in the GitHub Actions run list.

The `changes` job emits one versioned plan bound to the workflow's commit SHA.
Canary pushes use the latest successful push run of the current baseline policy
whose commit is an ancestor of the checked-out revision. CI records the policy
version in `ci.yml` independently of the run title. Existing runs with the
original v1 title still qualify. This carries changes from failed or
cancelled pushes into the next run. When the diff from the verified baseline
contains only documentation, the plan skips both browser suites. If no verified
ancestor is available, the planner runs full verification to establish one. Pull
requests and other branches continue to use their GitHub event base.

Source, database, browser and container smoke workers execute that plan through
`RAYPX_CI_PLAN`; they do not calculate a new scope from their own checkout state.
The `source` matrix runs **Source checks** and **Source tests** concurrently through
`ci:gate source checks|tests`. Checks owns format/lint, repository policy, locale parity,
affected types, selected current-platform Go checks and full-mode builds/artifact probes.
Tests owns complete selected workspace suites. The planner emits `source_phases` and
omits the test runner when no suites are selected. Both phases execute the original
plan; their task selections together cover the combined local verification command.

Turbo still owns each task graph and its prerequisites. Checks retains the existing
`javascript` cache partition; tests uses `source-tests`, avoiding concurrent cache writes
and separating runner workloads. The save gate compares the cache entry listing before and after the job, so test
results without output files are saved as well.
Both matrix results must succeed for the `source` gate to pass, with fail-fast disabled.

Missing plans, unsupported versions, mismatched commits and an invocation of an
unselected gate fail. Native workers use the same plan's runner matrix and
distribution selection. `verification/gates.ts` registers the required CI jobs;
the final `foundation` job verifies the plan outputs and every registered result.
An unknown dependency job must be registered before it can pass the final gate.

Local `.artifacts/verification/latest.json` records `running` before executing
checks, then `passed` or `failed`. Cancellation can leave `running`; it is not
success. Local success covers source checks and the selected current-platform
artifact probes, not separate database, browser, Docker or macOS/Windows CI gates.

Platform-specific filenames containing `windows`/`win32` select Windows;
`darwin`/`macos`/`unix` select macOS; shared native CI inputs default to Windows. Linux-only
native files run the Linux Go checks without requesting macOS/Windows. JavaScript
dependency reach alone never requests native runners, including renderer changes.
Native workflow changes default to Windows. Manual dispatch includes macOS only with
`macos=true`; release tag pushes always require both platforms. Local `verify` continues
to validate native inputs on the current platform. `foundation` requires every
selected gate to succeed and permits only intentional skips; an abandoned runner
is reported as unavailable, never as a passing native check.

Routine native acceptance prepares and seals the matching CLI, accepts its archive,
then runs process/task runners, installed CLI, Herdr and Go checks on the same runner.
It reuses one dependency install and Turbo cache restoration, and needs no renderer build
or CLI artifact upload/download. Go checks target the internal and native test packages;
they do not embed the production renderer. Source verification still checks renderer code.
The shared `.github/actions/native-checks` action owns these checks and their evidence
for both routine and distribution runs; changes to it also select native acceptance.
Go caches are separate from Turbo's JS task cache; smoke and production use separate outputs.
Routine checks run Herdr once; distribution runs repeat it three times on Windows
without blocking the parallel package/smoke phases.
Installer creation, signatures and installed GUI smoke run on tag pushes or manual
dispatch with the `distribution` checkbox enabled (`gh workflow run ci.yml -f distribution=true`).
Those runs require Go checks, production packaging and packaged GUI smoke in parallel.
Manual distribution runs have their own cancellation group, so routine pushes cannot
cancel a release acceptance run. The `macos` and `cold_native` selections also have
separate cancellation groups. For a Windows-only native comparison, use
`gh workflow run ci.yml --ref <branch> -f distribution=true -f cold_native=true`.
This disables Go compiler cache restoration and saving on fresh hosted native
runners; Bun installation and the shared Turbo JavaScript cache keep their usual policy.
Compare the same runner image/architecture and signing configuration. Record preparation,
package-step duration (native compilation plus installer creation), each job duration
and queue delay separately; whole-workflow elapsed time includes unrelated parallel gates.
Use the uploaded size report for the actual installer, Desktop payload and CLI component
bytes; GitHub artifact ZIP sizes measure transport compression. One run is a sample,
not a stable benchmark or evidence for macOS performance. Add `-f macos=true` for
explicit macOS acceptance.
Distribution prepares the immutable CLI and shared renderer once per selected platform;
that job alone saves Turbo cache entries and consumer phases only restore them. Routine
acceptance saves successful Turbo cache entries after its checks. Go setup precedes the Bun
install in both paths, keeping native cache restoration ahead of dependency extraction.
Verification, test and E2E tasks receive the fixed
`VITE_APP_RELEASE=verification`, so a new commit does not invalidate unchanged tasks. Native Go
compilation uses the Go cache and independent production/smoke package directories.
Generated route trees and native JSON use LF on every checkout so Windows generators do not
invalidate restored tasks. MyGo produces per-user NSIS installers for production and smoke. Smoke still installs the NSIS package and verifies payload hashes.
CI selects Go through apps/desktop/go.mod and keys its native cache with go.sum.
The CLI build ignores `.cache/herdr` downloads as task inputs: manifest pins still
invalidate the build, and restored `dist` already contains the verified binaries.
The manual `CLI size experiment` workflow compares isolated executable variants and
warm command startup on Windows; it does not run automatically or request macOS.
The planning job installs only Tooling's production dependencies without lifecycle scripts
or a download cache restore. Windows jobs install Bun packages from the registry because
extracting the download cache took longer than a fresh frozen install.
The browser job caches Playwright's Chromium headless shell by Playwright version and runs
`playwright install-deps` only when `ldd` reports a missing system library.
Timing and scope for local verification are recorded in `.artifacts/verification/latest.json`.

The [second attempt of the 2026-11-10 MyGo upgrade run](https://github.com/raypx/raypx/actions/runs/42786812059/attempts/2)
provides the baseline for combining routine native jobs: 8m11s from this attempt's
start to completion. Use `run_started_at` for the selected attempt; `created_at`
belongs to the original attempt, so their difference does not establish queue time.
Windows preparation took 2m46s and its
following check job took 4m34s; that second job repeated 60s of Bun/dependency setup,
24s of VP restoration and an artifact download. Combining routine acceptance removes
that repeated work and one runner allocation. Go setup remains required. These are
one run's measurements; hosted queue delays and the improvement need fresh CI runs.

The planner selects components by changed paths. Documentation-only test skipping
and the bounded platform/version matrix follow
[Vite's CI](https://github.com/vitejs/vite/blob/main/.github/workflows/ci.yml),
and an independent tag-triggered release flow from
[MyGo's release workflow](https://github.com/egoist/mygo/blob/main/.github/workflows/release.yml).
Raypx keeps its existing affected-workspace planner and adds no third-party filtering action.
The root launcher defaults to two workspace tasks. Shared Vitest defaults use one
worker and per-file isolation; larger suites set their worker count locally.
CLI, Desktop and Tooling also own their subprocess test timeouts locally.
Override task concurrency with `--concurrency-limit=1`
or `VP_RUN_CONCURRENCY_LIMIT`. A single direct runner can still use
`bun run --cwd packages/ui test --maxWorkers=2`.

```sh
bun run test --filter=@raypx/ui
bun run test '--filter=...@raypx/ui'
bun run raypx-dev tasks @raypx/ui#test -- --testNamePattern keyboard
bun run raypx-dev tasks desktop#build --dry-run
bun run test --verbose
```

Qualified `package#task` references accept scoped arguments after `--`. When forwarding
arguments with a filter, use a qualified reference to avoid changing dependency tasks.
`--dry-run` prints Turbo's plan without executing tasks. Task names are the package
script names; scripts stay independently runnable because they never re-enter the
graph. Use `bun run raypx-dev tasks @raypx/ui#test`, or `bun run test` for the suite
launcher. Verification gives a package its own Turbo invocation when its test task
receives a file selection.

Turbo records local results in `.turbo/cache` and a summary of each run in
`.turbo/runs/`. Cached logs describe an earlier execution; their test durations are
not the current command's elapsed time. A task hashes its workspace's tracked files, so
ignored outputs and tool caches never enter it.
Task inputs ignore `node_modules` listings and tool caches such as `.nitro`, `.vite` and
`.cache`, so a fresh CI runner can replay builds; `bun.lock` still invalidates dependency
changes. Keep the cache between runs. `bun run clean` removes task/transform caches while
preserving dependency packages, sources and local user data.

The root `dev` entry selects Web and the combined backend and allows two task slots. Preparation
and compilation dependencies complete before the long-running dev commands start.

## Unused code and coverage tooling

Run `bun run knip` for the full report. `knip.json` declares Vite app configs,
spawned fixtures, native smoke entries, type assertions and command-loaded tools
as entries.
Drizzle config is analyzed statically, without loading database
credentials. The Vitest scaffold is a static `.template` file copied into each new
workspace, so its workspace-relative imports need no Knip resolution exception.
The root script runs Knip's `knip-bun` binary. Root dependency overrides use
`resolutions` so Knip can track catalog references directly. Go-launched TypeScript
fixtures are explicit entries; vendored
skills stay outside product analysis. The root `skills` dependency is the CLI used
by `skills:update`. Root overrides pin `oxc-parser` and `@oxc-project/types` together
at `0.158.0`. Revalidate Tooling, Knip, type checks and builds when changing this
pair, including compatibility with Vite+'s declarations. Native parser bindings
follow the parser package. Vite+ 1.6.0 supplies `@oxc-project/runtime` at
`0.158.0`, `oxfmt` at `0.78.0`, and `oxlint-tsgolint` at `7.0.2006` without
root overrides. Keep `oxlint` and `@oxlint/plugins` overridden together at `1.90.0`
until the React `immutability` false positive in bundled Oxlint 1.91.0 is fixed
([upstream issue](https://github.com/oxc-project/oxc/issues/28401)). Revalidate lint,
formatting and Tooling before removing these overrides.
Pin standalone `vitest` and `@vitest/coverage-v8` to the same version in the dev catalog.
Workspaces inheriting the shared coverage configuration declare
`@vitest/coverage-v8` directly, including those forwarding `--coverage` to `test`.

## Cleanup

| Command                   | Removes                                                                                                                 | Preserves                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `bun run clean:artifacts` | Root/workspace `.artifacts/`, workspace coverage, root/workspace `node_modules/.cache/raypx-tests`, E2E results/reports | Built applications, Desktop prepared resources/packages, VP transform/task caches, source, dependencies, user/database data |
| `bun run clean`           | Report cleanup plus application builds/tool caches, staged native resources                                             | Source, dependencies, lockfiles, environment files, Git history, user profiles and database volumes                         |

Cleanup is explicit and idempotent. Do not run it during verification or while
inspecting reports; it removes local evidence without a recovery archive. New runs
create new reports, but do not recreate deleted historical results. No age-based
background deletion is installed.

The 2026-10-27 organization removed the snapshot-specific VP benchmark/probe,
AST split/rewrite and old commit-message scripts from `.artifacts/`. Inventory,
case-preservation and backend workflows now have maintained entry points above.
Historical logs and benchmark results remain generated evidence.
