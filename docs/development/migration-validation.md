# Historical Tauri / Node / pnpm validation

This record describes the retired [ADR 0045](../architecture/0045-tauri-node-pnpm.md)
implementation. Its Linux measurements and 2026-11-06 macOS/Windows smoke results
remain baseline evidence; none establish acceptance of the current MyGo/Bun build.
Current commands, evidence and remaining gates live in the
[MyGo/Bun implementation guide](mygo-bun-migration-plan.md) and
[ADR 0046](../architecture/0046-mygo-bun-artifacts.md).

## Historical Runtime Measurement

The 2026-11-05 snapshot predates ADR 0045's final distribution policy. That
intermediate staged runtime included Node and pnpm; it is not the current standalone
CLI package or current Desktop staging output. It was measured with:

```sh
pnpm run build:cli
pnpm exec tsx apps/cli/tests/smoke/metrics.ts
```

The probe uses a synthetic enrolled profile, an empty PATH and a working directory
outside the repository. It writes generated JSON under `.artifacts/migration/`
and removes its temporary profile and archive. It does not use an operator account
or database. The measured build was `0.1.0`, build identity `1793865524975`, with
Node 24.22.2 and pnpm 12.16.1.

| Measurement                                                 | Linux x64 result |
| ----------------------------------------------------------- | ---------------: |
| Complete distribution, sum of regular file sizes            |       271.52 MiB |
| gzip-compressed tar archive                                 |       103.91 MiB |
| Node and its license                                        |       122.22 MiB |
| Complete pnpm distribution and native pnpm/pnpx executables |       116.98 MiB |
| Herdr resources                                             |        28.89 MiB |
| Launcher, application and remaining metadata/licenses       |         3.43 MiB |
| `--version`, median of 15 process launches                  |           371 ms |
| First `--version` sample                                    |           493 ms |
| Foreground daemon ready, including CLI status polling       |           878 ms |
| Idle daemon process RSS, five samples after one second      |        98.80 MiB |

These are single-machine historical observations with concurrent validation builds
and an uncontrolled OS file cache. RSS covers the Node owner process with no active
tasks; it excludes future task subprocesses. The two native pnpm/pnpx executables
were regular copies in this intermediate bundle. The archive is not a desktop
installer.

No comparable pre-migration runtime/Desktop size, startup or memory measurements
were retained before the migration. No before/after improvement is claimed.
macOS/Windows installer sizes, GUI startup and GUI memory remain unmeasured.

## Intermediate Packaging Follow-up

This intermediate Linux x64 package used a small `pnpx` wrapper to avoid a duplicate
native binary. The measurements below are retained as history; the current package
no longer bundles pnpm and is measured separately in the next section.

| Measurement               | Before cleanup | Rebuilt output |
| ------------------------- | -------------: | -------------: |
| Complete CLI distribution |     270.46 MiB |     214.06 MiB |
| pnpm / pnpx component     |     116.98 MiB |      60.58 MiB |

The intermediate uncompressed Linux x64 distribution fell by 56.40 MiB (20.9%).
These figures sum regular-file bytes and do not measure archive/download size or
other platform installers. They are superseded by the current measurement below.

## Final Node CLI distribution (retired)

A fresh Linux x64 build was measured on 2026-11-06 with:

```sh
pnpm run build:cli
pnpm run size --package cli --require
pnpm exec tsx apps/cli/tests/smoke/metrics.ts
```

That installable `@raypx/cli` package required supported system Node and got
project package managers from the user's environment. It contains no Node or pnpm
runtime. One portable npm package includes verified Herdr assets for all supported
platforms, which account for most of its unpacked size. The metrics probe used a
synthetic enrolled profile, empty PATH and a working directory outside the repository.

| Measurement                        | Linux x64 result |
| ---------------------------------- | ---------------: |
| Unpacked package                   |       131.08 MiB |
| gzip-compressed tar archive        |        47.13 MiB |
| Herdr resources for all platforms  |       128.05 MiB |
| Application and metadata           |         3.01 MiB |
| Node / pnpm bundled in CLI package |             None |
| `--version`, median of 15 launches |           188 ms |
| First `--version` sample           |           192 ms |
| Daemon ready                       |           510 ms |
| Idle daemon process RSS            |       100.80 MiB |

Daemon readiness includes CLI status polling. RSS covers the Node owner process with
no active task. That Desktop staging added Node and a native launcher and kept only the
host's Herdr assets; macOS/Windows installer size and startup still require their
platform runners.

## Build output size snapshot

The historical `pnpm run size` recorded all buildable workspaces without starting services or
using a profile. The existing Linux x64 outputs on 2026-11-05 measured:

| Package            | Output                  |       Size |
| ------------------ | ----------------------- | ---------: |
| CLI                | Historical distribution | 271.52 MiB |
| API                | Nitro `.output`         |   4.38 MiB |
| Web                | Nitro `.output`         |   7.34 MiB |
| Desktop            | Renderer `dist/client`  |   2.34 MiB |
| Mobile             | Expo export `dist`      |  10.09 MiB |
| Storybook          | Static `dist`           |   8.80 MiB |
| Relay              | Server `dist`           |   2.42 MiB |
| Cloudflare ingress | Worker `dist`           |   0.05 MiB |
| Database           | Migration runner `dist` |   0.60 MiB |

These are sums of regular-file bytes in existing outputs, including maps/licenses,
not fresh builds or compressed download sizes. Desktop covers only the renderer;
Mobile covers the Expo export, not an APK/IPA. API/Web/Relay do not include the Node
runtime supplied by their deployment image. Source-only libraries have no separate
artifact and are included in consuming builds. Follow the
[build size guide](validation-artifacts.md#build-sizes) for CI summaries, exact-byte
JSON reports, CLI runtime breakdown and production native package measurements.

## Packaged Desktop smoke

On 2026-11-06, the GitHub Actions distribution run passed the interactive packaged
Desktop smoke on macOS and Windows for commit
[`f8c512b31032be11abbe41f48279445488cf0d06`](https://github.com/raypx/raypx/commit/f8c512b31032be11abbe41f48279445488cf0d06).
[CI run #42166525847](https://github.com/raypx/raypx/actions/runs/42166525847)

- macOS passed with the packaged `.app`. [macOS smoke job](https://github.com/raypx/raypx/actions/runs/42166525847/job/127725200677)
- Windows passed with the NSIS-installed test app, including runtime file verification and uninstall. [Windows smoke job](https://github.com/raypx/raypx/actions/runs/42166525847/job/127725272073)

Both jobs exercised native window focus, resize and close on their respective runners.

## Acceptance boundaries

`pnpm run verify` passed all 75 selected tasks. `pnpm run verify --full` passed all
85 tasks, including complete source suites, builds, Knip and relocated API, Web,
Relay and CLI probes. The Web/Desktop browser smoke passed all eight selected
cases. The offline Pi fixture also passed after bundling to ESM and relocating
the bundled Node runtime; durable resume and duplicate tool-effect prevention
were verified without provider calls.

Separate backend suites passed against owned temporary PostgreSQL 17 and Valkey 8
containers: 58 PostgreSQL tests, four Redis tests and nine multi-instance Relay
tests. The databases had synthetic identities and a `_test` suffix; the owned
containers were removed after the runs.

The standalone artifact probe exercises relocation, Chinese and space-containing
paths, empty PATH, CLI output and exit status, Herdr verification, Agent streaming,
tool approvals and daemon restart/resume. SQLite fixtures retain the original
schema, migration journal, projects, task history and offline instance key.

Native core tests exercise origin and IPC policy, sessions, event acknowledgements,
subprocess shutdown, instance locks and reconnecting to the same real daemon after
closing a UI proxy. Linux GUI compilation and strict Clippy also exercise the
production custom-protocol configuration. The original Windows-target cross-compilation
checked the process-token SID and restricted DACL implementation.

Compose and Railway Docker acceptance passed migrations, database/Redis readiness,
SSR, static assets, login, session cookies and Relay probes. Both profiles
used owned synthetic services and accounts; the run recorded successful cleanup
under `.artifacts/deployment/2026-11-05T07-36-27-810Z-299fb41c/`.

Full Desktop release acceptance also requires platform checks for system credential
persistence, notifications and tray behavior, signed installation and upgrade, macOS
notarization and Windows locked-file handling.
[Desktop release guide](desktop.md#build-and-release)
Linux Desktop remains unaccepted. No installer has been published.

The Tauri release/update instructions are retired. MyGo uses its own session and
update namespaces; follow the current [Desktop release guide](desktop.md#build-and-release)
and complete the new platform matrix before publishing.
