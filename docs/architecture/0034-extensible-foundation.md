# ADR 0034: Extensible multi-platform foundation

Status: accepted. Approved by the user for this rebuild; current implementation
reconciled 2026-11-09. Supersedes retired cloud-only and no-local-runtime choices.
See the [current architecture](README.md) for implemented responsibilities and
[ADR 0047](0047-bun-cli-production-packaging.md) for formal CLI packaging.

## Foundation

Web, Desktop, Mobile, API and CLI are application composition roots. Discover
workspaces from root `package.json`, without package-name allowlists or exhaustive
documentation inventories. Libraries expose explicit source entries and platform
metadata; extract a package when its responsibility and actual consumers establish
the boundary. Applications never import another application's source.

Theme belongs in UI. Local execution remains private to the CLI runtime; Desktop
launches its bundled executable by absolute path. Web and Desktop share DOM
authentication forms through Auth's browser client entry, while each application
owns its routes, clients, query access and navigation adapters. Universal hooks
and UI primitives keep their existing boundaries.

The account database and migration history are new and independent. Retired SQL
is available only in Git history and must not be applied by foundation commands.
No old user data or volumes are changed as part of the rebuild.

Consequences: entrypoint/platform checks and generator templates require maintenance,
but ordinary packages no longer require edits to a central architecture whitelist,
root task catalog or CI package-name matrix.

## Runtime and toolchain

Bun 1.4.4 is the JavaScript runtime for local tools, CLI/daemon, Nitro Web/API
services and deployment images. Root `packageManager` is the single Bun version
pin; `bun.lock` records installation. `raypx-dev policy` checks runtime consistency
and rejects `.nvmrc`, `engines.node` and Node setup in CI. There is no Nix shell;
mise may read the root pin without declaring another runtime version.

VP owns the sole task graph/cache and incremental file-based invalidation.
Lightweight workspace task configs declare dependencies and cache policy through
Tooling; application plugins live in separate Vite app configs. Native preparation
stays uncached, with generated files checked after it runs.

Web is a separate TanStack Start SSR service on Nitro's Bun preset beside API.
Desktop uses Start SPA mode inside MyGo v0.8.3 and Go 1.27.3 with the system
WKWebView/WebView2. Go owns native UI and policy. The bundled Bun CLI/daemon owns
execution. [ADR 0046](0046-mygo-bun-artifacts.md) records the host boundary.
