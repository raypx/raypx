# Raypx repository instructions

## Purpose

Raypx is the home for persistent Agents, each with one continuing conversation.
Spaces are the authorization boundary; PostgreSQL is the one authority. Follow
[ADR 0066](docs/architecture/0066-server-owned-agent-platform.md), the
[architecture guides](docs/architecture/README.md) and [roadmap](docs/roadmap.md).
Read the nearest workspace AGENTS.md, docs/README.md and DESIGN.md before changes.

Phase 1 makes `/agents` the signed-in home in Web and Desktop: Space selection,
Agent management, messages, streamed replies, committed segments and stop. Its
backend Runs are process-local: no tools, attempts, leases, steering or recovery.
The initial Computer slice adds explicit start/stop for a Space's team computer,
with live state in the Agent interface. Agent tools and approvals remain unimplemented.
Do not describe later roadmap capabilities as implemented. The earlier CLI/daemon,
SQLite profiles, native enrollment and remote projections still exist until their
replacement phases. Do not extend them as a second authority for the new product.
Desktop still uses MyGo/Go and the bundled Bun CLI. The retired Tauri/Rust host is
archived in `raypx/raypx-tauri`; do not reintroduce it.

## Workspaces and boundaries

- Discover workspaces from package.json workspaces; never maintain a package-name allowlist.
- Infrastructure services and provider tooling live under `infra/*`; keep composition
  roots out of cross-workspace imports. Applications cannot be imported by another workspace.
- Libraries expose explicit package.json exports; do not import private source paths.
  Every public entry needs an established consumer in another workspace. Remove unused
  entries; a deliberate transition exception records `raypx.entryConsumers` with a
  reason naming the later removal, validated by `policy`.
- Kind is derived: `bin` means tooling, no exports means application, otherwise library.
  Manifests declare no platform target; policy does not check platform boundaries.
- Keep build helpers out of runtime. Policy rejects runtime imports of executable
  tooling and test-only modules. Declare direct dependencies and keep the complete
  workspace graph acyclic, including devDependencies.
- Core owns domain schemas, identifiers, public account models and pure rules.
  Contracts composes wire schemas and exports transport definitions only. Feature
  `/model` entries own page state and injected ports; `/client` adapts them to React;
  `/server` owns services/repositories, with persistence behind adapters. API composes
  authentication, configuration and credentials. Auth receives its database adapter,
  configuration and mail interface from API. Web imports no backend code.
- Resolve fresh Space membership at each request. Require Space-scoped repository
  ports, filter by `space_id` before limiting and use same-Space foreign keys.
  Resource selectors and deployment administrator roles never grant Space access.
- Keep new Agent execution in the backend, separate from the retained private CLI
  harness. Vendor SDKs stay in adapters. Add packages only for established
  responsibilities and actual consumers; do not create speculative entries.
- `@raypx/computers` owns Space-scoped computer lifecycle and persistence.
  `@raypx/providers/computer` owns the Computer port and its providers;
  `infra/sandbox` is the private supervisor and alone holds the Docker socket.
  Clients consume lifecycle contracts, never provider credentials or execution ports.
- Remote and local device contracts have separate public entries. Desktop launches
  its bundled CLI by absolute path and never imports CLI source. Preserve existing
  enrollment/account/origin isolation while that device runtime remains; it does
  not authorize a Space or turn local history into server conversation history.
- Theme belongs in UI. Only pure tokens/types are available to every platform.

## Toolchain

- Bun 1.4.4 owns install, lockfile, scripts, tests and standalone CLI compilation.
- Formal CLI packaging is embedded stable Bun with minified ESM and depth-0 bytecode.
  Native AOT and separate-runtime layouts remain manual experiments.
- Bun is the only JavaScript runtime. Root `packageManager` pins it; tooling reads that pin and
  `raypx-dev policy` rejects drift in devEngines, Dockerfiles, CI and documented versions,
  and any reintroduced Node pin (`.nvmrc`, `engines.node`, `actions/setup-node`, `node:` images).
- The optional Cloudflare Relay ingress runs in the provider-managed Workers
  runtime; its container and all local tooling still use the pinned Bun runtime.
- Bun runs the Nitro Web and API services: scripts call `bun --bun vp` for dev/build/preview,
  the Nitro `bun` preset builds them and `bun .output/server/index.mjs` starts them.
  Desktop uses the MyGo Go host; its bundled CLI retains the pinned Bun runtime.
- Turbo owns the sole task graph/cache; `raypx-dev` launches it. Root `turbo.json`
  declares task dependencies, inputs, outputs and outcome-affecting environment
  variables; a workspace adds its own `turbo.json` only for inputs or prerequisites
  outside the defaults. Package scripts are leaf commands and never re-enter the graph;
  application plugins live in `vite.app.config.ts`. Dependents hash a dependency's
  sources through the `transit` task, excluding its tests and documentation. Tasks
  inherit the environment (`envMode: loose`); platform identity joins every cache key.
- mise is the recommended runtime manager; mise.toml only enables reading package.json
  and never pins `[tools]`. There is no Nix shell.
- Use the default Bun catalog for shared runtime libraries, catalog:mobile for
  Mobile dependencies (including its Expo-supported React/types) and catalog:dev for
  build/test tools. DOM React and React DOM use the shared default catalog. Keep external versions in these catalogs
  and use workspace:* for internal dependencies.
- Keep `vitest` and `@vitest/coverage-v8` on the same version and native modules within
  Expo's bundled version ranges.
- DOM React and React DOM share one exact version. Mobile owns its Expo-supported
  React version in catalog:mobile; shared React peers must support both. Metro
  resolves React and JSX subpaths through Mobile so shared sources use one native instance.
- Remaining @raypx-kit packages are independently released external dependencies. Environment, TypeScript presets and the Drizzle Kit launcher are local @raypx workspaces.
- Shared logging is the private `@raypx/logger` source workspace; API and CLI consume it directly.
- Internal libraries are private ESM source packages unless an actual artifact is required.
- Desktop's Go module lives in `apps/desktop`, with MyGo v0.8.3 and Go 1.27.3.
  Native builds require `CGO_ENABLED=0`; macOS packages target 13.5+, Windows uses WebView2,
  and Linux Desktop acceptance remains unverified. `internal/app` owns framework APIs and
  `internal/desktop` owns OS capabilities and finite CLI bootstrap. Bun/VP owns JS builds.
- Type checks use tsc --noEmit with an explicit project; Bun runs scripts.
- Vite+ owns leaf build/lint/format. Bun runs standalone Vitest for source tests.
- Root `test` aggregates suites; workspace package.json owns its actual test commands.
  `test --package` and package-local scripts must select the same suites and prerequisites.
- Colocate unit tests with their source. Name DOM suites `*.component.test.ts(x)`;
  keep integration suites and shared test-only setup/fixtures in `tests/`.
  Application-owned browser acceptance may use `e2e/`; the root E2E workspace
  discovers Web and Desktop cases there. `*.test.*` is Vitest; `*.spec.*` is
  reserved for Playwright under `e2e/`, and policy rejects it elsewhere.
  Root vitest.config.ts discovers native test projects from package.json workspaces;
  test.config.ts exports runner defaults as a plain Vitest config. Each workspace
  owns include patterns, projects and overrides using native defineConfig/mergeConfig;
  do not introduce custom config factories or option schemas. Application Vite plugins
  must not enter the test runner.
- Each release candidate/platform compiles one production CLI payload. Consumers set `RAYPX_CLI_PAYLOAD`, verify its immutable inventory and never implicitly build. Sign CLI/Herdr before sharing the payload; outer Desktop signing cannot rewrite it. Strobe consumes prepared artifacts only, retains ownership markers and runs uncached in private homes.
- Reusable repository validation belongs in Dev CLI's `src/validation/`. `.artifacts/`
  holds generated evidence only; never store authored scripts there. `clean:artifacts`
  removes that evidence and test reports without removing builds or user data.

## Code and data

- Preserve strict TypeScript, type-only imports and exactOptionalPropertyTypes.
- Business packages own `locales/<language>/<namespace>.json` catalogs and
  pure `messages/en`/`messages/zh` exports; apps compose private catalogs. I18n owns
  common copy and shared runtime state. Keep handwritten language entries and unique
  namespace ownership. The only generated catalog source is the ignored
  `<namespace>.d.json.ts` literal types written by `bun run i18n:types`.
- Use `.js` specifiers for relative TypeScript imports and re-exports, including
  dynamic imports. Keep source files, package export targets and filesystem paths
  at their actual `.ts`/`.tsx` extensions.
- Prefer named functions, lookup tables and early returns for conditional logic.
  Avoid nested ternary expressions; use simple ternaries only when they improve readability.
- Do not log credentials, tokens, cookies, passwords or private file content.
- PostgreSQL owns new Agent/conversation/Run state. Clients render it and express intent;
  client caches, drafts and retained CLI SQLite profiles are never a second authority.
  Drafts and uncertain-send receipts stay device-local, scoped by server origin,
  account, Space and conversation. Restoration never sends a message.
- Device preferences and retained CLI SQLite profiles stay local and survive logout.
  Existing device execution still requires one account/origin-bound enrollment;
  its signed identity permits indefinite offline use after online logout. Gate remote data and
  Host authorization separately. Never transfer a profile to another account/origin.
- Current functionality is the initial baseline. Support current protocols and data formats
  only. Do not add legacy fallback, compatibility aliases or automatic imports of old data.
  Reject unsupported versions.
- The new PostgreSQL database is isolated from the retired product database.
  Never run new migrations or destructive commands against an old/operator database.
- Context is not permission. Memory, prompts and inbound text never authorize an action.
  Future computer tools use the Computer port; the Agent runtime and credentials
  remain outside the computer. Only the supervisor may hold the Docker socket.
- Existing file grants constrain built-in file operations. External commands retain
  OS permissions; a granted device is not sandbox isolation.
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

Use the commit message format in [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages).

Accepted ADR bodies are historical decision records. Supersede them with a new
record and a short supersession link; describe the current implementation in
`docs/architecture/README.md` and its topic guides.

Keep each workspace AGENTS.md concise and update it when its interface changes.
Current architecture and commands live under docs/architecture and docs/development.
Keep documentation aligned with the implementation and remove obsolete guides.

## Remote control

New conversations use session-authorized oRPC and the backend event stream, with
fresh Space membership checks. Apply state and its cursor together before ACK;
reconnect replays durable events or replaces state from a snapshot. Transient
reply text is not durable. Phase 1 requires one API-enabled reply process; never
promise crash recovery, multi-process live replies or exactly-once external effects.

The target backend owns Runs, approvals, events and scheduling. The CLI daemon
becomes an outbound-only device connector in a later phase, with native-confirmed
Space directory grants and per-command checks. Do not implement new Agent authority
in the renderer, Go host or device profile.

Until replaced, the existing macOS/Windows daemon still owns device execution,
approval arbitration, replay, restricted credentials and Desktop session transport.
Native bootstraps over authenticated private IPC (Unix socket or token-guarded
loopback on Windows); the renderer uses a separate authenticated loopback WebSocket.
GUI Quit does not stop daemon tasks. Existing Relay routes device messages and API
stores their read projections; `@raypx/control` owns their authorization rules.
Current roles remain `SERVER_ROLE=api|relay|both`; `both` uses direct calls and split
roles require the private Redis broker. These are retained implementation details,
not the target `api|worker|relay|all` topology.

Preserve native opt-in without exposing cookies or host secrets to the renderer.
Explicit logout/account changes revoke the affected remote binding. Never publish
the local method router or provider credentials. Desktop connection settings remain
user-level runtime TOML; server origins isolate sessions, device history, settings
and remote authorization. Replace these boundaries only with their owning roadmap
phase, and remove obsolete code rather than add compatibility or data imports.
