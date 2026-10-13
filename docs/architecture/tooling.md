# Toolchain

## Runtime responsibilities

```text
Bun       dependency installation, lockfile, all JavaScript tools and production runtimes (1.4.0)
Turbo     workspace task graph, local/remote caching, pruned deployment
Vite+     leaf dev/build/test/lint/fmt/pack commands
Nitro     Web/API server and Worker executable build/deployment shell
Electrobun Desktop native host/packaging, pinned Bun 1.4.0 main process
```

Turbo replaces the Vite+ task runner; never run both task caches. Bun 1.4.0 runs
Web/API, Worker and its isolated Runner, and repository JavaScript tools.
Leaf commands explicitly use `bun --bun` so package executable shebangs resolve
to the pinned runtime. [ADR-0024](decisions/0024-bun-runtime.md) records the
runtime decision; [deployment](deployment.md) defines the artifact boundaries.

## Bun catalogs

The root `package.json` centralizes versions with Bun catalogs:

| Catalog            | Scope                               | Representative dependencies                                                                                                                              |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog:`         | Shared runtime and contracts        | React, TanStack Router/Start, oRPC, Better Auth, `use-intl`, UUID, Zod, Evlog                                                                            |
| `catalog:backend`  | Server and data tooling             | Hono, Nitro, Drizzle, PostgreSQL, Redis, Nanoid                                                                                                          |
| `catalog:frontend` | UI, email, and native surfaces      | Base UI, Phosphor Icons, Tailwind CSS, CVA, `cn`, Electrobun, Resend                                                                                     |
| `catalog:tooling`  | Build, test, and repository tooling | Turbo, Vite+, Vite alias, TypeScript, Storybook, Knip, `esbuild`, `jiti`, React types/plugin, Oxc transform, Citty, Dotenvx, Vitest coverage, Playwright |

Vitest itself is absent from the catalogs because Vite+ bundles the runner;
`@vitest/coverage-v8` remains explicit so its version can track that bundled
runner.

Internal workspaces use `workspace:*`. Independently published Toolkit packages
use catalogs even though their names share `@raypx/`. Before the first registry
publication, the Drizzle catalog entry uses a versioned `vendor/` tarball copied
into Docker install layers. See [Drizzle extensions](./drizzle-extensions.md).
Change external versions in the root catalog rather than workspace manifests.

Most stable third-party dependencies use caret semver ranges (`^`), including
`0.x` releases without a pre-release suffix. Vitest coverage is pinned exactly
to the runner bundled by Vite+. Pre-release dependencies remain exact: oRPC
beta, Drizzle RC, and Nitro beta. Vite+ and its Vite alias use matching stable
caret ranges.
Turbo and the Query/Router integration are initially pinned exactly so
the validated orchestration and framework combination does not drift. The committed
`bun.lock` records exact resolved versions for frozen installs.

Storybook packages and Lightning CSS also use ranges, but their resolved
versions must stay aligned with their companion packages.
Validate that alignment when refreshing the lockfile; a range does not remove
the requirement to upgrade coupled packages together.

Root overrides are reserved for cross-cutting toolchain constraints:

- `esbuild` follows `catalog:tooling` so every compatible consumer resolves to
  one version.
- `jiti` follows `catalog:tooling` so transitive packages cannot reintroduce an
  older exact 2.x version.
- `lightningcss` follows `catalog:tooling` to keep native bindings aligned.
- `vite` aliases to the Vite+ core implementation.

Treat changes to these overrides as toolchain upgrades: update the catalog,
regenerate `bun.lock`, and run the full verification suite.

## TypeScript presets

`@raypx/tsconfig` exports:

```text
base.json           strict shared rules, including an empty ambient `types`
browser.json        Vite, TanStack Start, and WebView applications
node.json           Node-compatible host APIs for API, DB, Scripts and E2E; types ["node"]
library.json        platform-neutral packages
react-library.json  shared React UI packages
```

Which workspace extends which preset is not listed here. That listing is derived
data — `grep extends */*/tsconfig.json` answers it, and the copy that lived here
was already stale — so read the workspace file instead.

A preset owns every option every consumer wants, including the ambient `types`
default and the unused-symbol checks. A workspace file therefore holds only
`include` plus the options that genuinely differ: `apps/web` widens `types`
because its `include` covers `vite.config.ts`, and
`packages/client` widens `lib` for DOM APIs. Restating an inherited value is a
`bun run policy` error, because the copy stops tracking the preset the moment the
preset changes.

The `node.json` name, `NodeNext` resolution and `node:*` APIs describe the
compatibility interface supported by Bun. Keep Bun-specific ambient types local
to workspaces that need them instead of widening shared presets.

Shared presets do not define `include`, `exclude`, `rootDir`, `outDir`, `paths`,
or workspace references. Full TypeScript Project References are deferred until
editor or full-repository type checking becomes measurably slow.

### Package-local imports

`@raypx/ui` defines `#lib/*`, `#hooks/*`, and `#components/*` in its own
`package.json#imports` for deep internal imports and package self-references.
Nearby relative imports remain valid. Other workspaces consume the existing
`@raypx/ui/...` public exports; private aliases do not cross package boundaries
or inherit from the root manifest.

The mappings target `.ts`/`.tsx` source files, matching this package's source
exports. The shared `moduleResolution: "Bundler"` preset resolves them without
duplicate `tsconfig.paths` entries. `packages/ui/components.json` uses the same
aliases, and the current shadcn CLI resolves component destination directories
from the import mappings. Check `resolvedPaths` with
`bun x --bun shadcn@latest info --cwd packages/ui --json` when changing them, then run
the UI component tests and `bun run verify` to cover consuming builds.

## Linting and formatting

Oxlint and Oxfmt ship inside Vite+ and are configured in the root
`vite.config.ts`, so the repository has no ESLint, Prettier, or standalone hook
manager to install:

```text
bun run lint         bun --bun vp lint          Oxlint, type-aware, with vite-plus and raypx plugins
bun run format       bun --bun vp fmt --check   fail on unformatted files
bun run format:fix   bun --bun vp fmt           rewrite files in place
bun run knip:report  bun --bun knip             report unused files, exports, dependencies, and duplicates
```

`bun run knip:report` is intentionally outside `verify` while the monorepo's
framework entrypoints and public package exports are being classified. The
configuration keeps explicit Nitro, Electrobun, Worker, Storybook and mail-script
entries visible to the scan and excludes generated output plus the
environment-validating Drizzle config. Once that baseline is clean, dependency
and duplicate-export findings can be promoted to the verification gate
independently.

`check` is `rpx tasks check` — per-workspace typecheck scripts. Desktop
and Mail typecheck their statically imported JSON catalogs directly, while Web
typechecks its explicit locale-to-dynamic-import map. A clean checkout does not
depend on generated translation files. It is deliberately not repointed at
`vp check`, which resolves a different graph (root-level typecheck plus fmt
and lint).

Oxfmt reads `.gitignore` and `.prettierignore`. `.prettierignore` remains for
generated files that stay visible to git — package compiler output, the TanStack route trees and Drizzle metadata —
and for vendored agent skills. Formatting those files would be reverted by
whichever tool owns them, producing permanent churn and defeating drift
detection.

Oxlint also excludes `packages/*/dist/**` through `vite.config.ts`; workspace
typechecks and tests validate the source that owns those generated files.
Turbo prepares Desktop's uncached Electrobun devkit/declarations before root lint,
so a clean checkout resolves the same SDK types as Desktop's strict checks.

`raypx/boundaries` reports source import violations at the import location:
layer direction, private cross-package paths and exports, renderer host access,
and internal runtime imports without a declared production dependency. It covers
static imports, re-exports, literal dynamic imports and TypeScript import types.
Tests retain their existing reverse-dependency allowance; route trees and declaration
files remain exempt. The plugin and policy share the workspace model under
`packages/scripts/src/architecture/`, including alias and relative-path resolution.
Policy still validates manifest dependencies and the complete dependency graph,
including edges discovered in source, without repeating source diagnostics.

The plugin loads workspace metadata once per invocation. Its source and metadata
are included in the root Turbo lint task's inputs. Use the bundled authoring API
from `vite-plus/lint/plugins`; do not add a standalone Oxlint dependency. Bun
loads the TypeScript plugin directly, so its internal imports use `.ts` and only
the no-emit scripts workspace enables `allowImportingTsExtensions`.
The JavaScript plugin host also runs on Bun. The 31 boundary cases exercise the
bundled Oxlint CLI, with a runtime guard and a forbidden Node executable in PATH.
This preserves source-import coverage while avoiding the bundled RuleTester
library's unsupported Bun execution path; manifest and graph checks stay in policy.

The `staged` block in `vite.config.ts` defines the pre-commit formatting and
lint-fix pass. The committed `.vite-hooks/pre-commit` script invokes `bun --bun vp staged`.
Each developer opts in through `bun --bun vp hooks enable`, which installs the generated
dispatcher under `.vite-hooks/_` and sets the local `core.hooksPath`; both remain
uncommitted.

## Repository scripts

`@raypx/scripts` exposes:

```text
tasks <task> [flags]   run the Turbo graph with platform and cache trust policy
e2e [suite] [args]     select all/web/desktop, a functional group, and Playwright flags
env -- <command>       run a child command with root development env files
doctor                  check core and optional development prerequisites
deps dedupe             remove duplicate dependency versions from bun.lock
deps dedupe --check     check for removable duplicates without changing files
deps audit              audit dependencies for known vulnerabilities
deps check              check for compatible dependency updates
deps update             write compatible updates and refresh bun.lock
skills update           update installed repository skills
clean [options]        remove rebuildable outputs and tool caches; optionally dependencies or Bun's cache
db migrate             apply Drizzle migrations
db push                push the schema without a migration in development/test
db clean               drop every table and migration record in development/test
db studio              open Drizzle Studio in development/test
db explain             inspect a fixed read-query catalog in development/test
policy [--fix]         check repository conventions; --fix rewrites the
                       findings that have exactly one possible remedy
generate               regenerate Drizzle artifacts
desktop build          build/check the renderer, then package Electrobun
verify                  run every gate: policy, format, lint, check, test,
                        build, the Worker artifact check, and Nitro runtime probes
verify --verbose        run every gate with full child-process output
shadcn update          refresh tracked shadcn/ui components in packages/ui
```

Dependency maintenance uses the repository-local `taze` CLI and Bun's
workspace/catalog resolver:

```text
bun run deps:check      fail when compatible dependency updates are available
bun run deps:update     write compatible updates, then refresh bun.lock
bun run deps:dedupe     remove duplicate versions already present in bun.lock
bun run deps:dedupe:check
                        fail when Bun can remove duplicate versions
bun run deps:audit      fail when Bun reports known dependency vulnerabilities
bun run skills:update   update installed repository skills non-interactively
```

The update command scans all workspaces and Bun catalogs in `minor` mode. It
includes exact pins, but deliberately excludes the pinned Bun runtime version,
Drizzle Kit/ORM RC builds (whose hash suffixes do not sort chronologically), and
`@vitest/coverage-v8`, whose version must keep matching the Vitest that the
pinned Vite+ release bundles — nothing else pins that Vitest now, so a Vite+
upgrade has to move coverage with it. Major upgrades and toolchain exceptions
remain manual decisions.

When updating all dependencies, check the existing pre-release channels as well:
oRPC uses `beta`, and Drizzle Kit/ORM use the same `rc5` build. Their `latest`
tags still point to older stable lines, so a stable-only scan misses updates.
Update Drizzle manually from `rc5`; the generic semver scan can recommend an
older build when its hash happens to sort higher.
Vite+ `1.1.0` bundles Vitest `5.0.3`. The coverage catalog pins
`@vitest/coverage-v8` to `5.0.3` so its exact Vitest and browser peers match
the bundled runner. A newer coverage release must wait for the same runner
version in Vite+.
Dependency maintenance excludes the runner and
coverage package at every major version; upgrade them together with Vite+ and
the root `vite` alias/override, and verify coverage after resolving the lockfile.

Refresh a cross-platform lockfile with `bun install --lockfile-only --os '*' --cpu '*'`,
then install locally with `bun install --frozen-lockfile`. This keeps the optional
native packages required by Linux CI and Windows Desktop builds in the lockfile.
Electrobun upgrades change the exact frontend catalog and `hutch.config.ts`
version together; prepare the matching SDK before native checks and packaging.
See [ADR-0020](./decisions/0020-electrobun-desktop-host.md).

The Bun commands are explicit maintenance operations rather than part of
`doctor` or `verify`. `deps:dedupe` may rewrite only Bun's lockfile; its
`--check` form is read-only. `deps:audit` is read-only and does not apply
upgrades. CI can run the two checking aliases when dependency health should be
a separate blocking gate.

Commands must support CI/non-interactive execution, explicit exit codes, and
structured logging. Destructive database operations are restricted to local
development and test environments.

`generate` covers Drizzle only. Both application route trees are owned by
`@tanstack/start-plugin-core`, whose Vite plugin appends the
`declare module '@tanstack/react-start'` Register footer to
`routeTree.gen.ts`. `@tanstack/router-cli` knows nothing about Start, so
invoking `tsr generate` standalone writes a tree without that footer: a
strictly worse file that still passes `tsc` and that the next `dev` or `build`
silently repairs into a spurious diff. Neither application defines a
`generate-routes` script for that reason. The two tools are versioned on
independent lines — `router-cli` 1.167.x against `react-router` 1.170.x and
`react-start` 1.168.x — so a version mismatch is not the cause and aligning
them is not the fix.

Use `rpx env -- <command>` only in workspace scripts that need root env
files. The runner uses the Dotenvx API directly rather than starting a second
CLI process. It loads `.env.local`, then `.env`, without overriding inherited
environment values. Tests are intentionally not wrapped. Do not add Vite
`envDir` settings or workspace-relative env paths; all repository-configured
env-file loading for development and build commands goes through this runner.

`@raypx/scripts` commands declare a `process`, `repository`, or `database`
environment policy. A shared contextual action creates the matching copied
environment and logger before invoking the command operation. Database
commands load and validate repository env directly; generate, Desktop
build, and shadcn update load the raw repository env for child processes;
clean and verify do not read env files. This avoids recursively invoking `rpx env` around another
`rpx` process. External Vite, Drizzle, and Electrobun workspace commands
continue to use the env runner.

Citty modules remain thin adapters. Database policies, PostgreSQL resource
construction, injectable operations, Doctor checks, Doctor runtime probes, and
Doctor report rendering are kept in separate modules. Tests target those seams
without connecting to PostgreSQL or starting optional tools.

`policy` follows the same shape and is what keeps repository conventions from
rotting: `src/policy/{agents,ignores,links,manifests,skills,tsconfig,workspaces}.ts`
are pure functions over text, `checks.ts` composes them, `runtime.ts` supplies the
filesystem adapters, and `report.ts` renders each finding with a copy-pasteable
`Fix:` line. It resolves workspaces from Bun's globs rather than a directory walk,
and reports any glob match lacking a `package.json` — a directory that nothing
builds or tests but that an agent reading the filesystem still treats as a place
code belongs. `rpx verify` runs it first, because a structural failure should
not wait for a build. Distinct from `doctor`, which asserts machine prerequisites
and therefore cannot run in CI.

Source boundary diagnostics run in Oxlint. Policy owns manifest production
dependencies and full workspace cycle detection; both use the same architecture
model, and policy's graph includes source imports as well as manifest edges.

`fixes.ts` applies the findings whose remedy is a transformation rather than a
decision: a canonical test script, a `build` that repeats its graph-owned `check`, a locally
restated `devEngines`, an unanchored ignore pattern, a duplicated one, and a
compiler option the preset already provides. Each fixer sits beside its validator
and shares the same private predicate, so the two cannot disagree about what
counts as a violation.

It deliberately stops short of the rest. Which catalog a dependency belongs in,
whether a stray test script or a missing runner is the mistake, and which preset a
config should extend are all judgements, and applying a guess would be worse than
leaving the finding. The command prints the report _after_ fixing, so what remains
on screen is what still needs a person — a fix that failed shows up rather than
being claimed. The rewritten files are handed to `vp fmt`, because a fixer that
rewrites JSON cannot also be the authority on how JSON is formatted.

Use `bun run policy:fix` for the procedural CLI; it does not enter the task graph.

Scripts filenames use domain directories as naming context (`database/policy.ts`,
`doctor/checks.ts`, and `runtime/process.ts`) instead of repeating prefixes in
the repository root. Relative ESM imports continue to use `.js` because the
workspace uses TypeScript `NodeNext` resolution.

`runtime/env.ts` exposes `resolveProcessEnvironment("process" | "repository")`.
The `process` source only copies inherited values; the `repository` source also
applies root `.env.local` and `.env` with a repository-scoped nested-runner
guard. The guard records the repository root in the child environment, so a
nested command in the same checkout skips duplicate loading while a command
that enters another checkout still resolves that repository's files. Schema
parsing remains in root `env.ts` and happens after the process environment has
been resolved.

`bun run clean` removes ignored, rebuildable outputs (including
`storybook-static`, Nitro output, TanStack storage, TypeScript build metadata,
and package archives), coverage and browser-test reports, root and workspace
tool caches, and Desktop's Electrobun `build`, `artifacts` and `.hutch` output. It
preserves dependencies, logs, databases, generated route trees, and Drizzle
migrations. `bun run clean:all` additionally removes every repository
`node_modules` and `node_modules.bun` directory, while
`bun run clean:bun-cache` runs the standard clean and also clears Bun's shared
machine-wide install cache, affecting every checkout on that machine.
Every root script for this package calls the `rpx` bin directly — `bun run
db:migrate` is `rpx db migrate` — so the colon-separated names are aliases for
nested CLI commands, and `bun run rpx <command>` reaches anything without one.
[ADR-0018](decisions/0018-turbo-task-orchestration.md) records why they no
longer route through a task runner.

Renaming this bin needs `bun.lock` changed with it. The lockfile records the bin
name as derived metadata and `bun install` links from the lockfile rather than the
manifest, while `--frozen-lockfile` still passes — so a rename appears to work
while `node_modules/.bin` keeps the old name. Edit that one line instead of
regenerating the lockfile: regenerating on macOS drops the 39 Linux-only optional
dependency entries and breaks the Linux CI job.

`bun run shadcn:update` re-runs `shadcn add --overwrite` for every component
listed in `packages/ui/shadcn-components.json`, refreshing them to the latest
upstream version. Add a component's name to that file's `components` array
when you pull it in with the shadcn CLI so future updates keep it in sync.
`--overwrite` regenerates the file from the vanilla upstream template, so it
discards any project-specific edits layered on top (custom variants or added
prop types).
Always review the diff after running it and manually re-apply project
customizations before committing; never run it unattended.

`bun run doctor` fails for an incorrect Bun version, missing repository
metadata, required local binaries, or invalid environment schemas. An absent
local Electrobun bootstrap or Docker tooling is reported as a warning
because native packaging and containers are optional workflows. `bun run db:studio` and `bun run db:push` are interactive and
bypass Turbo task orchestration.

`desktop:build` invokes root `build:desktop` to check and build the renderer
through Turbo, then Electrobun's stable native build. Desktop dev/build/check
scripts prepare the exact 2.0.2 devkit before resolving SDK aliases. Hutch is an
Electrobun leaf tool; Bun remains the package manager and Turbo the task runner.
The former `desktop:prepare` and `build:desktop:native-prep` commands are retired;
installers contain the pinned Bun host but no local Pi runner. Native preparation
and packaging remain uncached.

The Citty command tree provides `rpx --help`, nested command help such as
`rpx db --help`, and `rpx --version`.

Use root Bun scripts so the repository-local Vite+ version is selected instead
of a potentially different global `vp` binary.

## Browser verification

The private `@raypx/e2e` workspace owns Playwright configuration and browser
smoke tests. The Web project includes public, authenticated and cloud flows;
Desktop targets its own browser preview. `test:e2e:web` builds/starts API and Web,
while `test:e2e:desktop` builds/starts API and Desktop. `test:e2e` keeps the full
run. Worker is not a browser dependency. CI runs both suites on independent
runners with separate PostgreSQL services, ports and reports. Local parallel
runs also need separate checkouts because shared build output can race.
Browser tests are not part of the default `bun run test` graph. Use
`bun run test:e2e`, and install Chromium with
`bun --bun run --cwd e2e playwright install chromium`
when running locally. CI uses the same pinned catalog version and invokes the
workspace-local Playwright binary to install Linux browser dependencies before
the browser tests in the Linux E2E matrix jobs. See
[Testing and verification](../development/testing.md#github-actions) for the
zero-secret workflow and optional local diagnostics.

## Turbo task graph and cache trust

Root scripts call `rpx tasks`, which delegates to the local Turbo binary.
`build` depends on `check`, dependency builds, and transitive source hashes.
Packages that export TypeScript source have transit nodes rather than fake
no-emit builds. Shared pack is a prerequisite of consumer checks/tests; build
scripts no longer rerun checks. Root lint/format checks run once for the whole
repository. Direct workspace build commands are leaf tools, not shipping gates.

Turbo uses strict environment mode. `VITE_*`, `NODE_ENV`, and `NITRO_PRESET` affect
build keys. Root config, the shared test config, TS presets, catalogs, lockfile and env files also affect
hashes. The shared DOM preload helpers under `packages/scripts/src/testing/**`
are also global inputs, so changing the Bun/jsdom adaptation invalidates cached
test results. `rpx tasks` fingerprints the actual Bun version and revision, OS,
architecture and libc so native artifacts cannot cross incompatible hosts.
Outputs are limited to `dist`, Nitro `.output`, Storybook and explicit coverage;
never put user inputs, sessions, credentials or signed URLs inside these paths.

Set `TURBO_TOKEN`, `TURBO_TEAM` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` together for
Vercel remote caching. There is no login or secret committed by this repository.
Missing configuration uses local cache only. Signatures authenticate cached
artifacts; they do not encrypt them. CI remote credentials and cross-run local
cache are restricted to trusted canary pushes/manual runs. Pull requests never
receive those credentials. Untrusted CI invocation strips any inherited remote
credentials and forces local-only mode.

`verify` keeps cheap-to-expensive gates; unit and component tests are cached,
integration and external effects are not. Real PostgreSQL/E2E, provider calls,
Bun artifact probes, document conversion, migrations and deployment always execute.
`format:fix`, maintenance and database operations remain direct uncached commands.

Docker prunes with the exact Turbo catalog version. The dependency layer installs
`out/json` against the canonical lockfile frozen with scripts delayed; the source layer then supplies `out/full`
and root TS/Vite/Turbo config, runs shared postinstall, and builds via Turbo.
Builder images contain the pinned toolchain. Final images keep only compiled
runtime artifacts; the Worker also keeps its fixed converters and fonts.

Worker builds through Vite+ and Nitro. `vite.config.ts` owns the Vite plugin and
workspace resolution; `nitro.config.ts` uses the Bun preset with a custom
`src/main.ts` entry. The resulting `.output/server/index.mjs` starts the durable
Host by default; `--runner` selects one isolated Run process from the same
executable. Lightweight mode dispatch loads Host composition or Runner execution
dependencies dynamically. Shared chunks remain in the artifact; no companion
Runner executable is needed. The custom entry does not add an HTTP listener.

Nitro owns dependency tracing and copying. Explicit `traceDeps` entries retain
complete PDF/XLSX/PPTX package assets, while workspace TypeScript is bundled.
The provider adapter and Pi dependency tracing are removed under
[ADR-0027](decisions/0027-remove-pi-sdk.md). There is no custom esbuild builder,
package-closure implementation or separate `runtime:prepare` prerequisite.
Turbo caches `.output/**` as a complete artifact, so cache restoration includes
the executable, its chunks and runtime dependencies/assets. Root
build scripts still run checks and dependency builds first. Runtime checks are
uncached. [ADR-0023](decisions/0023-worker-vite-nitro-artifact.md) supersedes only
ADR-0018's earlier Worker compilation/runtime-preparation split.
[ADR-0025](decisions/0025-worker-single-entry-execution.md) supersedes only its
dual-entry provisions, retaining separate task processes and Host-owned deadlines.

`scripts/dev.mjs` runs Vite's builder in watch mode. After Nitro finishes a
successful rebuild, it gracefully stops the previous host and starts the new
artifact using the current Bun executable. A failed build leaves the current
host running. Restart dev after installed dependencies or manifests change.

Turbo 2.11.7 can omit a development dependency that also appears as an optional
peer when pruning Bun locks (`@raypx/shared` / `@orpc/server`). Builders therefore
overlay the canonical root `bun.lock` before frozen installation. Bun 1.4 skips
workspaces absent from the pruned manifest and installs only the included closure.
This keeps exact resolutions and trades some lock-layer cache granularity for
reproducibility; never regenerate a deployment lock with floating ranges.
