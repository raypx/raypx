# Raypx repository instructions

## Purpose

Raypx is a multi-platform account foundation with device-local desktop tools.
Read the nearest workspace AGENTS.md and docs/README.md before changing code.
The accepted foundation design supersedes documents in docs/history.

## Workspaces and boundaries

- Discover workspaces from root package.json; never maintain a package-name allowlist.
- Applications are composition roots and cannot be imported by another workspace.
- Libraries expose explicit package.json exports; do not import private source paths.
- Every workspace declares raypx.kind and raypx.target. Mixed workspaces declare
  entryTargets and sourceTargets. Keep platform constraints transitive.
- Runtime code cannot import tooling or test-only modules. Declare direct dependencies.
- Keep the complete workspace dependency graph acyclic, including devDependencies.
- Auth receives its database adapter, configuration and mail interface from API.
- Remote contracts and local device contracts have separate public entries.
- Desktop launches the bundled CLI by absolute path. Do not import CLI source.
- Desktop local tools and its device-profile workspace require no account. Gate remote
  data and host authorization on login; keep legacy account-owned local data isolated.
- Theme belongs in UI. Only pure tokens/types are available to every platform.
- Add packages when their responsibility and actual consumers are established.
- Core owns task domain schemas and pure rules; contracts composes wire schemas and
  retains compatible re-exports. Tasks/model owns page state and injected view ports;
  Tasks/client adapts those models to React. Keep execution in CLI's private harness
  until a second execution consumer establishes a shared package boundary.

## Toolchain

- Bun 1.4.4 owns install, lockfile, scripts, tests and standalone CLI compilation.
- Bun is the only JavaScript runtime. Root `packageManager` pins it; tooling reads that pin and
  `raypx-dev policy` rejects drift in devEngines, Dockerfiles, CI and documented versions,
  and any reintroduced Node pin (`.nvmrc`, `engines.node`, `actions/setup-node`, `node:` images).
- Bun runs the Nitro Web and API services: scripts call `bun --bun vp` for dev/build/preview,
  the Nitro `bun` preset builds them and `bun .output/server/index.mjs` starts them.
  Desktop uses the Tauri Rust host; its bundled CLI retains the pinned Bun runtime.
- VP owns the sole task graph/cache. Lightweight `vite.config.ts` files register
  `task:*` definitions through `@raypx/tooling/tasks`; application plugins live in
  `vite.app.config.ts`. Cache actual file inputs, explicit build outputs and
  outcome-affecting environment variables. Preserve inherited environment for leaf commands.
  mise is the recommended runtime manager; mise.toml
  only enables reading package.json and never pins `[tools]`. There is no Nix shell.
- Use the default Bun catalog for runtime libraries and catalog:dev for build/test tools.
  Keep external versions there and use workspace:* for internal dependencies.
- @raypx-kit packages remain independently released external dependencies.
- Shared logging is the private `@raypx/logger` source workspace; API and CLI consume it directly.
- Internal libraries are private ESM source packages unless an actual artifact is required.
- Rust libraries live under `crates/*`; the Desktop application crate lives under
  `apps/desktop/src-tauri`. They share the root Cargo workspace, independently
  of Bun workspace discovery. Inherit shared Cargo package/lint settings and commit
  root Cargo.lock. rust-toolchain.toml pins Rust; VP runs Cargo tasks uncached while
  Cargo owns incremental compilation. See crates/AGENTS.md and docs/development/rust.md.
- For routine Rust cleanup, use `bun run rust:clean` (`cargo clean --workspace --profile dev`)
  to preserve dependency caches and Release artifacts. `bun run clean` uses the same
  Rust policy alongside application cleanup. A full `target/` reset needs an explicit request.
- Use Bun's native no-emit check with an explicit tsconfig; declaration emit uses TypeScript.
- Vite+ owns leaf build/test/lint/format. Keep independent Vitest configurations.
- Root `test` aggregates suites; workspace package.json owns its actual test commands.
  `test --package` and package-local scripts must select the same suites and prerequisites.
- Put test suites and test-only setup/fixtures in each workspace's `tests/` directory.
  Root test.config.ts exports runner defaults as a plain Vitest config. Each workspace
  owns include patterns, projects and overrides using native defineConfig/mergeConfig;
  do not introduce custom config factories or option schemas. Application Vite plugins
  must not enter the test runner.
- Reusable repository validation belongs in Tooling's `src/validation/`. `.artifacts/`
  holds generated evidence only; never store authored scripts there. `clean:artifacts`
  removes that evidence and test reports without removing builds or user data.

## Code and data

- Preserve strict TypeScript, type-only imports and exactOptionalPropertyTypes.
- Do not log credentials, tokens, cookies, passwords or private file content.
- Device preferences and CLI SQLite profiles stay local and survive logout.
- The new PostgreSQL database is isolated from the retired product database.
  Never run new migrations or destructive commands against an old/operator database.
- File grants constrain built-in file operations. External commands retain OS permissions.
- Local protocol dates are ISO strings; terminal bytes use base64.
- Preserve original logos and neutral light/dark visual tokens. Keep keyboard focus,
  accessible labels, reduced motion and Chinese/English copy.
- Use existing shadcn/Base UI primitives from `@raypx/ui` for DOM controls.
  Compose product-specific controls in Blocks or the owning feature package.
  Use Select, RadioGroup and Collapsible for feature interaction instead of
  native select/radio/details controls; keep semantic form grouping and labels.
- Use Tailwind utilities for feature layout and styling. Keep CSS entry points for
  imports, source registration, shared theme tokens and necessary global/library rules;
  do not add feature-specific CSS selectors.
- Do not edit generated route trees or vendored agent skills by hand.
- Preserve unrelated user changes. Build/cache files are not source artifacts.

## Verification

Run narrow meaningful tests, then bun run verify. The default gate needs no GUI,
database or mail provider. PostgreSQL auth tests, browser tests and packaged
native checks are separate explicit gates.
Report unavailable checks as unavailable; never describe an unrun platform as passed.

## Documentation

Keep each workspace AGENTS.md concise and update it when its interface changes.
Current architecture and commands live under docs/architecture and docs/development.
docs/history is historical context and does not constrain the new foundation.

## Remote control

Opted-in remote Agent tasks use explicit API projections and device-scoped grants.
On macOS and Windows the independent CLI daemon owns execution, approval arbitration, the
durable replay journal, the outbound WebSocket and restricted device credentials.
Desktop connects over authenticated private IPC (Unix socket, or token-guarded loopback
on Windows; see ADR 0037); GUI Quit does not stop daemon tasks. API relays messages and stores read
projections. Native handles initial opt-in without exporting cookies or host secrets
to the renderer. Explicit logout/account changes revoke the affected binding. Never publish the
local method router or provider credentials. Desktop connection settings are
user-level runtime TOML; server origins isolate sessions, remote settings and
account-specific local Agent history.
