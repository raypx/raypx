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

## Initial Linux acceptance record

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

## Distribution acceptance

Run the full hosted macOS/Windows matrix on the exact `dev` candidate:

```sh
gh workflow run ci.yml --ref dev -f distribution=true
```

Each platform prepares one production Bun CLI, signs it when credentials are
configured, seals its inventory and accepts the final archive outside the
repository with an empty PATH and synthetic HTTPS provider endpoints. Windows
also tests Unicode paths, removal of the original installation, first Herdr PTY
use from the complete versioned daemon copy and explicit restart/stop cleanup.

Parallel checks, production packaging and installed GUI smoke consume that exact
CLI artifact ID. Tauri smoke checks Desktop-first and CLI-first startup against
the same daemon PID/epoch, verifies its build identity and confirms GUI Quit
preserves the daemon. Windows uses the real per-user NSIS installation. Production
inspection rejects smoke controls and modified CLI/Herdr resources.

Native smoke phase identities and cleanup status are uploaded from
`.artifacts/native-smoke/`. Production delivery directories, installers, size and
available signing evidence are separate CI artifacts. Missing signing/notarization
credentials are explicitly reported; unsigned package acceptance does not prove
signed distribution or updater acceptance. Hosted run results must be assessed
separately from the Linux record above.

## Hosted delivery record — 2026-11-06

Candidate `c2a9566a8ab1666164554fc785f19eda0f7a9f4c` passed all **14 jobs** in
the [complete distribution run](https://github.com/raypx/raypx/actions/runs/42235551818).
Local full verification also passed all 92 tasks and relocated artifact probes;
the subsequent Windows test-runner correction passed affected verification (83 tasks).

| Gate                                                                       | macOS arm64    | Windows x64                                    |
| -------------------------------------------------------------------------- | -------------- | ---------------------------------------------- |
| Final standalone CLI archive and isolated provider probes                  | Passed         | Passed                                         |
| Process/task runners, installed CLI and Herdr PTY                          | Passed         | Passed; PTY repeated three times               |
| Rust format, check, Clippy and native tests with the compiled CLI          | Passed         | Passed                                         |
| Production package, CLI/Herdr checksums and smoke-control exclusion        | Passed         | Passed                                         |
| Interactive GUI, Desktop-first/CLI-first daemon identity, Quit and cleanup | Passed         | Passed; actual per-user NSIS install/uninstall |
| Production installer                                                       | DMG: 57.75 MiB | NSIS: 55.02 MiB                                |

The macOS production application directory measured 129.97 MiB. Sizes include
the bundled CLI and overlap; application, installer and CLI sizes are not additive.
JavaScript, backend, browser, deployment and the final aggregate gate also passed.

The GUI driver uses a separate smoke-enabled host with the same sealed production
CLI. Production packages are independently inspected to exclude smoke controls.
Both downloaded GUI evidence records match the candidate commit and report passed
cleanup. Windows task-runner acceptance explicitly launches the Bun CLI because
VP's `node.exe` worker mode treats Bun's `run` subcommand as a filename; literal
Chinese, space, `$()` and `&` arguments remain covered.

Installers were unsigned: Developer ID, Authenticode, notarization credentials and
Tauri updater keys/feed were not configured. Signed distribution, updater behavior,
live account/provider flows, installed-app upgrade continuity and Linux GUI remain
unverified. CI retains the CLI archives, production delivery directories, installers,
size reports and native phase evidence as separate artifacts.

Generated local evidence lives in `.artifacts/bun-tauri/`, with the detailed
verification plan in `.artifacts/verification/latest.json` and size reports under
`.artifacts/sizes/`. Downloaded hosted evidence lives under
`.artifacts/bun-tauri-delivery/42235551818/`. These directories are intentionally
ignored by Git.
