# ADR 0046: MyGo, Bun and immutable CLI artifacts

Status: accepted, 2026-11-06. Supersedes [ADR 0045](0045-tauri-node-pnpm.md).

Packaging amendment (2026-11-07): [ADR 0047](0047-bun-cli-production-packaging.md)
formalizes stable Bun 1.4.4 with an embedded runtime and depth-0 bytecode as the
CLI/daemon production distribution. The MyGo host and platform release gates
remain defined by this record.

Raypx restores MyGo v0.7.4, Go 1.27.3 and Bun 1.4.4 while retaining the current
product, package boundaries, protocols, local SQLite schema and durable execution behavior.
Bun owns installation and `bun.lock`, scripts and server runtimes; API/Web use Nitro's
Bun preset. VP remains the sole task graph/cache. macOS targets 13.5+ and Windows uses WebView2.

Each candidate/platform compiles `apps/cli/src/main.ts` once with Bun's compiler,
ESM/minify/depth-0 bytecode. The embedded build identity and payload inventory share one value.
The manifest binds commit, platform, architecture and CLI/Bun/Herdr versions to exact bytes.
Desktop launches this self-contained executable by absolute path. Node staging, the Rust
launcher and the intermediate VP pack bundle are removed. User project managers and external
provider CLIs retain their environment/PATH precedence.

The platform prepare job signs CLI/Herdr and updates inner then outer inventories. Desktop,
standalone archives, functional smoke and Strobe consume this immutable payload by exact
artifact ID. Consumers fail on missing/mismatched inputs; cache restoration never licenses
implicit compilation. Outer host/installer signing cannot change the shared payload. macOS
arm64 archives use tar.gz; Windows x64 uses zip, both with final SHA-256. Windows daemon and
connectors retain complete versioned payloads with atomic installs, leases, ownership,
explicit repair and downgrade protection.

The daemon continues after GUI Quit. Switching hosts requires exiting the GUI, explicitly
stopping the old daemon and waiting for its lock. MyGo uses `mygo-sessions-v3.sqlite` and the
`mygo-session-key-v3-` credential namespace, requiring fresh sign-in. Historical native
sessions are never imported or deleted. Device profiles, signed offline enrollment, history,
Host authorization and preferences remain local. Unsupported formats are rejected.

Strobe 0.13.0 is a direct development dependency only at its consumers. It measures prepared
artifacts in private homes with credentials removed and process ownership retained. macOS uses
native accessibility/process measurement; Windows reports native and temporary WebView2 CDP
acceptance independently. Browser SPA fixture results identify their browser engine and do
not satisfy native WebView gates. Performance tasks are uncached, manually invoked on a
reserved device, and initially have no blocking regression threshold. Refusals, missing
attribution and inconclusive intervals remain explicit evidence.

The [unified implementation and acceptance guide](../development/mygo-bun-migration-plan.md)
owns commands and outstanding release gates. Acceptance of this decision does not assert that
macOS/Windows signing, installation, provider interception or performance measurements passed.
