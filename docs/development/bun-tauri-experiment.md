# Bun + Tauri experiment

This branch starts at `origin/dev` commit
`986f58d5531c159f24da97ed532442bc0071ed82`. It retains the Tauri 2.12.5 / Rust
1.99.1 host and replaces Node/pnpm with Bun 1.4.4 throughout the workspace.
Bun compiles the CLI; Tauri launches the verified executable by absolute path.
The renderer, account/origin boundaries and independent daemon remain in place.

The Bun runtime and immutable CLI distribution follow the implementation in
`canary` commit `44ef5625` (MyGo/Bun); the Tauri native host follows `dev` at the
base above. CLI and `raypx daemon` modes share one Bun-compiled executable and
need no installed JavaScript runtime. The complete terminal-capable distribution
also carries Herdr resources, licenses and checksum inventories beside it.

## Reproduce

```sh
bun install --frozen-lockfile
bun run doctor
bun run policy
bun run --cwd apps/desktop check
bun run --cwd apps/desktop test
bun run --cwd apps/desktop tauri:check
bun run --cwd apps/desktop tauri:test
bun run build:cli
bun run build:desktop
bun run verify
```

On a native development machine, `bun run dev:desktop` launches Vite and Tauri.
`bun run package:desktop` packages the matching CLI payload. Set
`RAYPX_CLI_PAYLOAD` to an absolute prepared CLI directory to reuse one build;
staging rejects modified or mismatched platform/version inventories.

## Acceptance record

Validated on Linux x64 (CentOS Stream 9), with Bun 1.4.4 and Rust 1.99.1.

| Check                                                   | Result                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Frozen Bun installation                                 | Passed                                                                                |
| `bun run verify`                                        | Passed, 83/83 tasks; policy, formatting, lint, source checks and selected tests       |
| Desktop tests                                           | 256 passed                                                                            |
| CLI tests                                               | 464 passed, 1 skipped                                                                 |
| Tooling tests                                           | 258 passed, 1 skipped                                                                 |
| Rust core tests / format / check / Clippy               | Passed; 19 core tests                                                                 |
| Compiled CLI daemon continuity                          | Passed with `RAYPX_TAURI_CLI` set to the actual Bun executable                        |
| CLI and Desktop renderer production builds              | Passed                                                                                |
| API / Web / Relay production builds                     | Passed                                                                                |
| Relocated API / Web / Relay artifact probes             | Passed; synthetic fixtures, no operator database                                      |
| Installed CLI artifact acceptance                       | Passed in Docker with `--network none`, outside the repository and with an empty PATH |
| Native GUI build / execution                            | Unavailable: this host lacks WebKitGTK 4.1 development libraries                      |
| macOS / Windows GUI, installers, signatures and updater | Not run on this Linux host                                                            |

Installed CLI acceptance includes synthetic Pi streaming, managed tool approvals
and daemon restart/resume. It does not establish live provider acceptance. The
focused Rust continuity check launches the actual compiled CLI, closes its GUI
transport, reconnects to the same daemon and explicitly stops only its temporary
profile. No user profile is used.

Measured existing outputs: CLI payload **144.05 MiB** (embedded Bun executable
**115.15 MiB**, Herdr **28.89 MiB**, plus metadata), Desktop renderer **2.34 MiB**.
These overlap with future native packages and must not be added to installer sizes.
Native bundle size is unavailable.

Generated local evidence lives in `.artifacts/bun-tauri/`, with the detailed
verification plan in `.artifacts/verification/latest.json` and size reports under
`.artifacts/sizes/`. These directories are intentionally ignored by Git.

Linux headless Rust results do not establish macOS/Windows GUI acceptance. Signing,
notarization, installers, updater behavior, real account/provider flows and daemon
survival through installed-app upgrades still require the platform release matrix.
