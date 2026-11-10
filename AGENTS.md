# Raypx repository instructions

## Purpose

Desktop uses the MyGo/Go host with the Bun CLI/daemon. The retired Tauri/Rust host is
archived in `raypx/raypx-tauri`; do not reintroduce it here.

Raypx is a project-centered personal development workbench with device-local Desktop execution and optional Web remote access.
Read the nearest workspace AGENTS.md and docs/README.md before changing code.
The accepted foundation design and current architecture decisions define the implementation.

## Workspaces and boundaries

- Discover workspaces from package.json workspaces; never maintain a package-name allowlist.
- Infrastructure services and provider tooling live under `infra/*`; declare each
  workspace's actual app/tooling kind and keep composition roots out of cross-workspace imports.
- Applications are composition roots and cannot be imported by another workspace.
- Libraries expose explicit package.json exports; do not import private source paths.
- Every public entry has an established consumer in another workspace. An entry nobody
  imports is removed rather than kept for a possible future use; a deliberate exception
  records `raypx.entryConsumers` with its reason and is validated by `policy`.
- Every workspace declares raypx.kind and raypx.target. Mixed workspaces declare
  entryTargets and sourceTargets. Keep platform constraints transitive.
- Runtime code cannot import tooling or test-only modules. Declare direct dependencies.
- Keep the complete workspace dependency graph acyclic, including devDependencies.
- Auth receives its database adapter, configuration and mail interface from API.
- Remote contracts and local device contracts have separate public entries.
- Desktop launches the bundled CLI by absolute path. Do not import CLI source.
- Desktop and CLI execution require one account/origin-bound instance enrollment.
  A signed local identity permits indefinite offline work; online logout preserves it.
  Gate remote data and Host authorization separately on login. Never transfer a profile
  to another account/origin. Only device-owned local work is supported.
- Theme belongs in UI. Only pure tokens/types are available to every platform.
- Add packages when their responsibility and actual consumers are established.
- Core owns task, memory and job domain schemas, public account models and pure rules; contracts composes wire schemas and
  exports only transport definitions. Tasks/model owns page state and injected view ports;
  Tasks/client adapts those models to React. Keep execution in CLI's private harness
  until a second execution consumer establishes a shared package boundary.

## Toolchain

- Bun 1.4.4 owns install, lockfile, scripts, tests and standalone CLI compilation.
- Formal CLI packaging is embedded stable Bun with minified ESM and depth-0 bytecode
  (ADR 0047). Native AOT and separate-runtime layouts remain manual experiments.
- Bun is the only JavaScript runtime. Root `packageManager` pins it; tooling reads that pin and
  `raypx-dev policy` rejects drift in devEngines, Dockerfiles, CI and documented versions,
  and any reintroduced Node pin (`.nvmrc`, `engines.node`, `actions/setup-node`, `node:` images).
- The optional Cloudflare Relay ingress runs in the provider-managed Workers
  runtime; its container and all local tooling still use the pinned Bun runtime.
- Bun runs the Nitro Web and API services: scripts call `bun --bun vp` for dev/build/preview,
  the Nitro `bun` preset builds them and `bun .output/server/index.mjs` starts them.
  Desktop uses the MyGo Go host; its bundled CLI retains the pinned Bun runtime.
- VP owns the sole task graph/cache. Lightweight `vite.config.ts` files register
  `task:*` definitions through `@raypx/tooling/tasks`; application plugins live in
  `vite.app.config.ts`. The TypeScript presets register uncached bootstrap tasks
  directly to avoid a dependency cycle with Tooling. Cache actual file inputs,
  explicit build outputs and outcome-affecting environment variables. Preserve
  inherited environment for leaf commands.
  mise is the recommended runtime manager; mise.toml
  only enables reading package.json and never pins `[tools]`. There is no Nix shell.
- Use the default Bun catalog for shared runtime libraries, catalog:mobile for
  Mobile dependencies (including its Expo-supported React/types) and catalog:dev for
  build/test tools. DOM React and React DOM use the shared default catalog. Keep external versions in these catalogs
  and use workspace:* for internal dependencies.
- Keep coverage aligned with Vite+'s bundled Vitest and native modules within
  Expo's bundled version ranges.
- DOM React and React DOM share one exact version. Mobile owns its Expo-supported
  React version in catalog:mobile; shared React peers must support both. Metro
  resolves React and JSX subpaths through Mobile so shared sources use one native instance.
- Other @raypx-kit packages remain independently released external dependencies; environment and TypeScript presets are local @raypx workspaces.
- Shared logging is the private `@raypx/logger` source workspace; API and CLI consume it directly.
- Internal libraries are private ESM source packages unless an actual artifact is required.
- Desktop's Go module lives in `apps/desktop`, with MyGo v0.8.3 and Go 1.27.3.
  Native builds require `CGO_ENABLED=0`; macOS packages target 13.5+, Windows uses WebView2,
  and Linux Desktop acceptance remains unverified. `internal/app` owns framework APIs and
  `internal/desktop` owns native policy and CLI transport. Bun/VP owns JS builds.
- Type checks use tsc --noEmit with an explicit project; Bun runs scripts.
- Vite+ owns leaf build/test/lint/format. Keep independent Vitest configurations.
- Root `test` aggregates suites; workspace package.json owns its actual test commands.
  `test --package` and package-local scripts must select the same suites and prerequisites.
- Colocate unit tests with their source. Name DOM suites `*.component.test.ts(x)`;
  keep integration suites and shared test-only setup/fixtures in `tests/`.
  Application-owned browser acceptance may use `e2e/`; the root E2E workspace
  discovers Web and Desktop cases there.
  Root test.config.ts exports runner defaults as a plain Vitest config. Each workspace
  owns include patterns, projects and overrides using native defineConfig/mergeConfig;
  do not introduce custom config factories or option schemas. Application Vite plugins
  must not enter the test runner.
- Each release candidate/platform compiles one production CLI payload. Consumers set `RAYPX_CLI_PAYLOAD`, verify its immutable inventory and never implicitly build. Sign CLI/Herdr before sharing the payload; outer Desktop signing cannot rewrite it. Strobe consumes prepared artifacts only, retains ownership markers and runs uncached in private homes.
- Reusable repository validation belongs in Tooling's `src/validation/`. `.artifacts/`
  holds generated evidence only; never store authored scripts there. `clean:artifacts`
  removes that evidence and test reports without removing builds or user data.

## Code and data

- Preserve strict TypeScript, type-only imports and exactOptionalPropertyTypes.
- Prefer named functions, lookup tables and early returns for conditional logic.
  Avoid nested ternary expressions; use simple ternaries only when they improve readability.
- Do not log credentials, tokens, cookies, passwords or private file content.
- Device preferences and CLI SQLite profiles stay local and survive logout.
- Current functionality is the initial baseline. Support current protocols and data formats
  only. Do not add legacy fallback, compatibility aliases or automatic imports of old data.
  Reject unsupported versions.
- The new PostgreSQL database is isolated from the retired product database.
  Never run new migrations or destructive commands against an old/operator database.
- File grants constrain built-in file operations. External commands retain OS permissions.
- Local protocol dates are ISO strings; terminal bytes use base64.
- Preserve original logos and neutral light/dark visual tokens. The logo-palette accent
  is limited to public-page decoration as scoped in DESIGN.md; the workbench stays
  neutral. Keep keyboard focus, accessible labels, reduced motion and Chinese/English copy.
- Use existing shadcn/Base UI primitives from `@raypx/ui` for DOM controls.
  Compose product-specific controls in Blocks or the owning feature package.
  Use Select, RadioGroup and Collapsible for feature interaction instead of
  native select/radio/details controls; keep semantic form grouping and labels.
- Prefer icons and UI affordances over explanatory copy: `IconButton` and `HelpHint`
  from `@raypx/ui`, empty states and disabled reasons. Follow the copy rules in DESIGN.md.
- Use Tailwind utilities for feature layout and styling. Keep CSS entry points for
  imports, source registration, shared theme tokens and necessary global/library rules;
  do not add feature-specific CSS selectors.
- Do not edit generated route trees or vendored agent skills by hand.
- Preserve unrelated user changes. Build/cache files are not source artifacts.

## Verification

Run focused meaningful tests and `bun run verify` for daily delivery. It selects
affected source checks/tests and Go host tasks only for native inputs. Shared
JavaScript dependency/configuration changes broaden source checks without selecting
builds or native platforms. Go-only changes select host checks; workflow orchestration
selects Tooling validation and its relevant acceptance gates. Mixed changes combine
their scopes. Use `bun run verify --full` for release preparation or an
explicit full-validation request; it includes repository-wide audits, builds and
current-platform artifact probes. PostgreSQL, browser and packaged native acceptance
run separately; releases require their full selected matrix.
Report unavailable checks as unavailable; never describe an unrun platform as passed.

## Documentation

Accepted ADR bodies are historical decision records. Supersede them with a new
record and a short supersession link; describe the current implementation in
`docs/architecture/README.md` and its topic guides.

Keep each workspace AGENTS.md concise and update it when its interface changes.
Current architecture and commands live under docs/architecture and docs/development.
Keep documentation aligned with the implementation and remove obsolete guides.

## Remote control

Opted-in remote Agent tasks use explicit API projections and device-scoped grants.
On macOS and Windows the independent CLI daemon owns execution, approval arbitration, the
durable replay journal, the outbound WebSocket and restricted device credentials.
Desktop connects over authenticated private IPC (Unix socket, or token-guarded loopback
on Windows; see ADR 0037); GUI Quit does not stop daemon tasks. Relay routes messages; API stores read
projections. Native handles initial opt-in without exporting cookies or host secrets
to the renderer. Explicit logout/account changes revoke the affected binding. The independent
`infra/relay` service owns socket peers; API reaches it over the private Redis broker.
Shared `@raypx/control` services own authorization and projection rules. Never publish the
local method router or provider credentials. Desktop connection settings are
user-level runtime TOML; server origins isolate sessions, remote settings and
remote authorization.
