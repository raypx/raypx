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
- Desktop's renderer requires account login; the local CLI runtime remains independent of authentication.
- Theme belongs in UI. Only pure tokens/types are available to every platform.
- Add packages when their responsibility and actual consumers are established.

## Toolchain

- Bun 1.4.4 owns install, lockfile, scripts, tests and standalone CLI compilation.
- `.nvmrc` pins Node and root `packageManager` pins Bun. Tooling reads them; `raypx-dev policy`
  rejects drift in engines, Dockerfiles, CI and documented versions.
- Node runs the Nitro Web and API services: scripts call `bun vp` (never `bun --bun vp`)
  for dev/build/preview, and the default production target uses Node 24.15.0.
  Explicit `build:cloudflare` tasks use Nitro's cloudflare_module preset and a separate
  `.output-cloudflare` directory. Runtime adapters share the same API and auth logic.
  Desktop uses Electrobun's pinned host.
- Turbo owns the sole task graph/cache and uses loose environment mode. Keep variables
  affecting cached outputs in `env`/`globalEnv`; other parent variables pass through automatically.
  mise is the recommended runtime manager; mise.toml
  only enables reading .nvmrc/package.json and never pins `[tools]`. There is no Nix shell.
- Use the default Bun catalog for runtime libraries and catalog:dev for build/test tools.
  Keep external versions there and use workspace:* for internal dependencies.
- @raypx-kit packages remain independently released external dependencies.
- Internal libraries are private ESM source packages unless an actual artifact is required.
- Use Bun's native no-emit check with an explicit tsconfig; declaration emit uses TypeScript.
- Vite+ owns leaf build/test/lint/format. Keep independent Vitest configurations.
- Put test suites and test-only setup/fixtures in each workspace's `tests/` directory.
  Shared runner defaults live in root test.config.ts; application Vite plugins must not enter the test runner.

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
CLI owns execution, approval arbitration and the durable replay journal. Native
owns the outbound WebSocket; API relays messages and stores read projections. WebView
owns account-session grant renewal. Never publish the local method router or provider credentials.
