# Raypx repository instructions

## Purpose

Raypx is the home for persistent Agents, each with one continuing conversation.
Spaces are the authorization boundary; PostgreSQL is the one authority. Follow
[ADR 0066](docs/architecture/0066-server-owned-agent-platform.md), the
[architecture guides](docs/architecture/README.md) and [roadmap](docs/roadmap.md).
Read the nearest workspace AGENTS.md, docs/README.md and DESIGN.md before changes.

The implemented platform includes paged conversations, durable Runs with fenced
leases/checkpoints/recovery, Computer tools, approvals/effects, routines, Agent and
Space memory, Pages, text skills, remote HTTP MCP servers, Space-owned OpenAPI
tools, model connections, shared Spaces, groups and delegation. Web/Desktop compose the shared workspace;
Mobile supports Space Agents and groups, shared Space membership/invitations,
routines, Agent/Space memory, read-only Pages/resource directories, resource
enablement/availability, approvals and computer lifecycle. Full Page/resource
management uses Web handoff; native platform acceptance remains separate.
Web/Desktop and Mobile keep active Runs outside loaded history reachable through
a bounded Still working strip with Stop, targeted steering, approvals and a
trigger-page jump. Only Space owners manage HTTP API definitions, operations,
availability and write-only credentials; Mobile shows their activity and approvals.
Client coverage and separate acceptance gates are documented in PRODUCT.md.
Auto review uses a separately configured deployment model with bounded, durable,
fail-closed decisions. Untrusted input, HTTP changes and unlisted commands still ask.
Protected input supports one-use sandbox command environments and HTTP bearer credentials;
values stay outside model history, events and checkpoints. Device/file/MCP input
destinations and hosted computers remain unimplemented. Member-owned device
computers use a separate outbound-only CLI connector, locally confirmed Space
directory grants and per-operation checks. Device commands require approval or an
exact executable Allow even in Never ask; Auto never approves them. macOS arm64
real-daemon acceptance is separate from packaged Desktop and unverified platforms.
Optional graphical computers and member takeover use the private Computer port,
session-authorized screen streams and PostgreSQL control grants; Mobile has no Screen UI.
The CLI supplies the outbound-only device connector and a separate private Desktop
session daemon. That daemon owns encrypted Desktop cookies, bounded selected-origin
HTTP and server-event transport only; it owns no Agent execution or scheduling.
Desktop still uses MyGo/Go and the bundled Bun CLI. Earlier device profiles,
enrollment, local tasks and remote projections are removed without importing data.

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
- Keep Agent execution in the backend, separate from device I/O and Desktop session
  transport. Vendor SDKs stay in adapters. Add packages only for established
  responsibilities and actual consumers; do not create speculative entries.
- `@raypx/computers` owns Space-scoped computer lifecycle and persistence.
  `@raypx/providers/computer` owns the Computer port and its providers;
  `infra/sandbox` is the private supervisor and alone holds the Docker socket.
  Clients consume lifecycle contracts, never provider credentials or execution ports.
- Connector transport and private Desktop contracts have separate public entries.
  Desktop launches its bundled CLI by absolute path and never imports CLI source.
  Connector credentials bind one account/origin; Desktop session selection grants
  no Space or device authority.
- Theme belongs in UI. Only pure tokens/types are available to every platform.

## Toolchain

- Bun 1.4.4 owns install, lockfile, scripts, tests and standalone CLI compilation.
- Formal CLI packaging is embedded stable Bun with minified ESM and depth-0 bytecode.
  Native AOT and separate-runtime layouts remain manual experiments.
- Bun is the only JavaScript runtime. Root `packageManager` pins it; tooling reads that pin and
  `raypx-dev policy` rejects drift in devEngines, Dockerfiles, CI and documented versions,
  and any reintroduced Node pin (`.nvmrc`, `engines.node`, `actions/setup-node`, `node:` images).
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
- Each release candidate/platform compiles one production CLI payload. Consumers set `RAYPX_CLI_PAYLOAD`, verify its immutable inventory and never implicitly build. Sign the CLI before sharing the payload; outer Desktop signing cannot rewrite it. Acceptance uses prepared artifacts and private temporary homes.
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
  client caches, drafts and connector receipts are never a second authority.
  Drafts and uncertain-send receipts stay device-local, scoped by server origin,
  account, Space and conversation. Restoration never sends a message.
- Device preferences survive logout. Connector consent/receipts stay in restricted
  account/origin-bound storage. Desktop cookies live only in the private
  `desktop-session.sqlite` session store; keys come from native OS storage.
  Never read, import or rewrite earlier profile databases or credential stores.
- Current functionality is the initial baseline. Support current protocols and data formats
  only. Do not add legacy fallback, compatibility aliases or automatic imports of old data.
  Reject unsupported versions.
- The new PostgreSQL database is isolated from the retired product database.
  Never run new migrations or destructive commands against an old/operator database.
- Context is not permission. Memory, prompts and inbound text never authorize an action.
  Computer tools use the Computer port; the Agent runtime and credentials
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
reconnect replays durable events or replaces state from a snapshot. History paging
uses its own scoped boundaries, independently of the event cursor. Transient reply
text stays process-local; committed segments are durable. Runs use PostgreSQL leases,
fences, attempts and checkpoints. Never replay unknown effects or promise exactly-once
external outcomes. Worker startup owns scans; runtime construction performs no I/O.

The backend owns Runs, approvals, effects, events, routines and delegation. Child
Runs inherit the initiating member's authority. Default SERVER_ROLE=all combines
API, worker and connector Relay; split API/worker coordination uses PostgreSQL.
Redis is optional in combined roles and required for split connector frame routing;
it also supports optional sessions, rate limits and configuration invalidation.
No legacy role alias, v5 Relay endpoint or account/device read projection remains.

The outbound-only device connector checks native-confirmed Space directory grants
without owning Agent execution. Its journals are bounded consent/transport receipts.
The independent Desktop session daemon uses authenticated private IPC (Unix socket
or token-guarded loopback on Windows), with a separate bounded renderer WebSocket.
Only the session daemon holds Desktop cookies. Go supplies OS keys, native dialogs,
preferences and finite bundled CLI bootstrap. GUI Quit releases its UI binding and
leaves the connector and accepted server Runs independent.

Desktop runtime TOML selects exact server origins. Origin/account changes close
old event streams; explicit sign-out clears session selection. No renderer holds
connector credentials, cookies, native capabilities or administrative tokens.
The connector and Desktop session database never import earlier device data.
