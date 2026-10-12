# Toolchain

## Runtime responsibilities

```text
Bun       dependency installation, lockfile, and repository scripts
Turbo     workspace task graph, local/remote caching, pruned deployment
Vite+     leaf dev/build/test/lint/fmt/pack commands
Nitro     API and Web TanStack Start server build/deployment shell
Node.js   Web, API and Worker production runtime (24.18.0)
Rust      Tauri native runtime
```

Turbo replaces the Vite+ task runner; never run both task caches. Runtime services remain on Node.js until
real compatibility tests and benchmarks justify a change.

## Bun catalogs

The root `package.json` centralizes versions with Bun catalogs:

| Catalog            | Scope                               | Representative dependencies                                                                                                                              |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog:`         | Shared runtime and contracts        | React, TanStack Router/Start, oRPC, Better Auth, `use-intl`, UUID, Zod, Evlog                                                                            |
| `catalog:backend`  | Server and data tooling             | Hono, Nitro, Drizzle, PostgreSQL, Redis, Nanoid                                                                                                          |
| `catalog:frontend` | UI, email, and native surfaces      | Base UI, Phosphor Icons, Tailwind CSS, CVA, `cn`, Tauri, Resend                                                                                          |
| `catalog:tooling`  | Build, test, and repository tooling | Turbo, Vite+, Vite alias, TypeScript, Storybook, Knip, `esbuild`, `jiti`, React types/plugin, Oxc transform, Citty, Dotenvx, Vitest coverage, Playwright |

Vitest itself is absent from the catalogs because Vite+ bundles the runner;
`@vitest/coverage-v8` remains explicit so its version can track that bundled
runner.

Internal packages use `workspace:*`. Change third-party versions in the root
catalog rather than individual workspace manifests.

Most stable third-party dependencies use caret semver ranges (`^`), including
`0.x` releases without a pre-release suffix. Vitest coverage is pinned exactly
to the runner bundled by Vite+. Pre-release dependencies remain exact: oRPC
beta, Drizzle RC, and Nitro beta. Vite+ and its Vite alias use matching stable
caret ranges.
Turbo, Pi AI and the Query/Router integration are initially pinned exactly so
the validated orchestration and SDK combination does not drift. The committed
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

`@voidmix/tsconfig` exports:

```text
base.json           strict shared rules, including an empty ambient `types`
browser.json        Vite, TanStack Start, and WebView applications
node.json           API, DB, Scripts, and E2E; widens `types` to ["node"]
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

Shared presets do not define `include`, `exclude`, `rootDir`, `outDir`, `paths`,
or workspace references. Full TypeScript Project References are deferred until
editor or full-repository type checking becomes measurably slow.

### Package-local imports

`@voidmix/ui` defines `#lib/*`, `#hooks/*`, and `#components/*` in its own
`package.json#imports` for deep internal imports and package self-references.
Nearby relative imports remain valid. Other workspaces consume the existing
`@voidmix/ui/...` public exports; private aliases do not cross package boundaries
or inherit from the root manifest.

The mappings target `.ts`/`.tsx` source files, matching this package's source
exports. The shared `moduleResolution: "Bundler"` preset resolves them without
duplicate `tsconfig.paths` entries. `packages/ui/components.json` uses the same
aliases, and the current shadcn CLI resolves component destination directories
from the import mappings. Check `resolvedPaths` with
`bunx shadcn@latest info --cwd packages/ui --json` when changing them, then run
the UI component tests and `bun run verify` to cover consuming builds.

## Linting and formatting

Oxlint and Oxfmt ship inside Vite+ and are configured in the root
`vite.config.ts`, so the repository has no ESLint, Prettier, or standalone hook
manager to install:

```text
bun run lint         vp lint          Oxlint, type-aware, with the vite-plus plugin
bun run format       vp fmt --check   fail on unformatted files
bun run format:fix   vp fmt           rewrite files in place
bun run knip:report  knip             report unused files, exports, dependencies, and duplicates
```

`bun run knip:report` is intentionally outside `verify` while the monorepo's
framework entrypoints and public package exports are being classified. The
configuration keeps explicit Nitro, Tauri, Worker, Storybook and mail-script
entries visible to the scan and excludes generated output plus the
environment-validating Drizzle config. Once that baseline is clean, dependency
and duplicate-export findings can be promoted to the verification gate
independently.

`check` is `vmx tasks check` — per-workspace typecheck scripts. Desktop
and Mail typecheck their statically imported JSON catalogs directly, while Web
typechecks its explicit locale-to-dynamic-import map. A clean checkout does not
depend on generated translation files. It is deliberately not repointed at
`vp check`, which resolves a different graph (root-level typecheck plus fmt
and lint).

Oxfmt reads `.gitignore` and `.prettierignore`. `.prettierignore` remains for
generated files that stay visible to git — the TanStack route trees and Drizzle metadata —
and for vendored agent skills. Formatting those files would be reverted by
whichever tool owns them, producing permanent churn and defeating drift
detection.

The `staged` block in `vite.config.ts` defines the pre-commit formatting and
lint-fix pass. The committed `.vite-hooks/pre-commit` script invokes `vp staged`.
Each developer opts in through `vp hooks enable`, which installs the generated
dispatcher under `.vite-hooks/_` and sets the local `core.hooksPath`; both remain
uncommitted.

## Repository scripts

`@voidmix/scripts` exposes:

```text
tasks <task> [flags]   run the Turbo graph with platform and cache trust policy
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
db seed                seed development/test data
db studio              open Drizzle Studio in development/test
admin create           create an idempotent initial administrator
policy [--fix]         check repository conventions; --fix rewrites the
                       findings that have exactly one possible remedy
generate               regenerate Drizzle artifacts
desktop build          build the Tauri application
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
includes exact pins, but deliberately excludes Bun/Node runtime versions,
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
Vite+ `1.0.0` bundles Vitest `5.0.1`. The coverage catalog pins
`@vitest/coverage-v8` to `5.0.1` so its exact Vitest peer matches the runner.
The separately published coverage `5.0.3` must wait for a matching Vite+ release.
Dependency maintenance excludes the runner and
coverage package at every major version; upgrade them together with Vite+ and
the root `vite` alias/override, and verify coverage after resolving the lockfile.

Refresh a cross-platform lockfile with `bun install --lockfile-only --os '*' --cpu '*'`,
then install locally with `bun install --frozen-lockfile`. This keeps the optional
native packages required by Linux CI and Windows Desktop builds in the lockfile.
Update Desktop's Rust dependency resolution with `cargo update` in
`apps/desktop/src-tauri`, followed by the native checks in
[Testing and verification](../development/testing.md).

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

Use `vmx env -- <command>` only in workspace scripts that need root env
files. The runner uses the Dotenvx API directly rather than starting a second
CLI process. It loads `.env.local`, then `.env`, without overriding inherited
environment values. Tests are intentionally not wrapped. Do not add Vite
`envDir` settings or workspace-relative env paths; all repository-configured
env-file loading for development and build commands goes through this runner.

`@voidmix/scripts` commands declare a `process`, `repository`, or `database`
environment policy. A shared contextual action creates the matching copied
environment and logger before invoking the command operation. Database and
Admin commands load and validate repository env directly; generate, Desktop
build, and shadcn update load the raw repository env for child processes;
clean and verify do not read env files. This avoids recursively invoking `vmx env` around another
`vmx` process. External Vite, Drizzle, and Tauri workspace commands
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
code belongs. `vmx verify` runs it first, because a structural failure should
not wait for a build. Distinct from `doctor`, which asserts machine prerequisites
and therefore cannot run in CI.

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
tool caches, and Tauri's generated schemas and Cargo `target` directory. It
preserves dependencies, logs, databases, generated route trees, and Drizzle
migrations. `bun run clean:all` additionally removes every repository
`node_modules` and `node_modules.bun` directory, while
`bun run clean:bun-cache` runs the standard clean and also clears Bun's shared
machine-wide install cache, affecting every checkout on that machine.
Every root script for this package calls the `vmx` bin directly — `bun run
db:migrate` is `vmx db migrate` — so the colon-separated names are aliases for
nested CLI commands, and `bun run vmx <command>` reaches anything without one.
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

`bun run doctor` fails for incorrect Bun/Node versions, missing repository
metadata, required local binaries, or invalid environment schemas. Missing
Rust/Cargo or Docker tooling is reported as a warning because those workflows
are optional. `bun run db:studio` and `bun run db:push` are interactive and
bypass Turbo task orchestration.

Tauri invokes root `build:desktop:native-prep`: uncached `desktop:prepare`
creates the pinned native runner resources before `build:desktop` enters Turbo.
Native packaging itself remains uncached.

The Citty command tree provides `vmx --help`, nested command help such as
`vmx db --help`, and `vmx --version`.

Use root Bun scripts so the repository-local Vite+ version is selected instead
of a potentially different global `vp` binary.

## Browser verification

The private `@voidmix/e2e` workspace owns Playwright configuration and browser
smoke tests. Its public Web and protected Admin projects both target the
integrated Web app on port `3000`; one Playwright `webServer` entry starts it for
local and CI runs.
Browser tests are not part of the default `bun run test` graph. Use
`bun run test:e2e`, and install Chromium with
`bun run --cwd e2e playwright install chromium`
when running locally. CI uses the same pinned catalog version and invokes the
workspace-local Playwright binary to install Linux browser dependencies before
the browser tests in the combined Linux CI job. See
[Testing and verification](../development/testing.md#github-actions) for the
zero-secret workflow and optional local diagnostics.

## Turbo task graph and cache trust

Root scripts call `vmx tasks`, which delegates to the local Turbo binary.
`build` depends on `check`, dependency builds, and transitive source hashes.
Packages that export TypeScript source have transit nodes rather than fake
no-emit builds. Shared pack is a prerequisite of consumer checks/tests; build
scripts no longer rerun checks. Root lint/format checks run once for the whole
repository. Direct workspace build commands are leaf tools, not shipping gates.

Turbo uses strict environment mode. `VITE_*`, `NODE_ENV`, and `NITRO_PRESET` affect
build keys. Root config, the shared test config, TS presets, catalogs, lockfile and env files also affect
hashes. `vmx tasks` fingerprints the actual Node/Bun executable versions, OS,
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
Node probes, document conversion, migrations and deployment always execute.
`format:fix`, maintenance and database operations remain direct uncached commands.

Docker prunes with the exact Turbo catalog version. The dependency layer installs
`out/json` against the canonical lockfile frozen with scripts delayed; the source layer then supplies `out/full`
and root TS/Vite/Turbo config, runs shared postinstall, and builds via Turbo.
Builder images contain Node 24.18.0 and Bun 1.4.0. Final images keep only Node
runtime artifacts; the Worker also keeps its fixed converters and fonts.

Turbo 2.11.7 can omit a development dependency that also appears as an optional
peer when pruning Bun locks (`@voidmix/shared` / `@orpc/server`). Builders therefore
overlay the canonical root `bun.lock` before frozen installation. Bun 1.4 skips
workspaces absent from the pruned manifest and installs only the included closure.
This keeps exact resolutions and trades some lock-layer cache granularity for
reproducibility; never regenerate a deployment lock with floating ranges.
