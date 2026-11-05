# Tauri / Node / pnpm migration validation

The implementation follows [ADR 0045](../architecture/0045-tauri-node-pnpm.md).
This record describes local evidence from Linux x64 on 2026-11-05. It does not
establish macOS, Windows or Linux Desktop release acceptance.

## Runtime measurements

The complete standalone CLI distribution was measured with:

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

These are single-machine observations with concurrent validation builds and an
uncontrolled OS file cache. RSS covers the Node owner process with no active tasks;
it excludes future task subprocesses. The two native pnpm/pnpx executables are
regular copies, and both contribute to the uncompressed size. The archive is a
CLI distribution archive, not a desktop installer.

No comparable pre-migration runtime/Desktop size, startup or memory measurements
were retained before the migration. No before/after improvement is claimed.
macOS/Windows installer sizes, GUI startup and GUI memory remain unmeasured.

## CLI Packaging Follow-up (2026-11-06)

The Linux x64 package now uses a small `pnpx` wrapper that delegates to the bundled
native `pnpm dlx` command, so it no longer carries a second copy of the native binary.
The wrapper and cleanup were validated with the bundled `pnpm --version`,
`pnpx --version` and `pnpx --help` commands. The Windows batch wrapper is generated
by the same build but still needs execution on Windows.

| Measurement               | Before cleanup | Rebuilt output |
| ------------------------- | -------------: | -------------: |
| Complete CLI distribution |     270.46 MiB |     214.06 MiB |
| pnpm / pnpx component     |     116.98 MiB |      60.58 MiB |

The local uncompressed Linux x64 distribution fell by 56.40 MiB (20.9%). The
before-cleanup values are from the local output immediately before removing the
duplicate binary; the rebuilt values come from `pnpm run size --package cli --require`.
These figures sum regular-file bytes and do not measure archive/download size or
other platform installers.

## Build output size snapshot

`pnpm run size` now records all buildable workspaces without starting services or
using a profile. The existing Linux x64 outputs on 2026-11-05 measured:

| Package            | Output                  |       Size |
| ------------------ | ----------------------- | ---------: |
| CLI                | Complete distribution   | 271.52 MiB |
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
paths, empty PATH, CLI output and exit status, bundled Node/pnpm, Agent streaming,
tool approvals and daemon restart/resume. SQLite fixtures retain the original
schema, migration journal, projects, task history and offline instance key.

Native core tests exercise origin and IPC policy, sessions, event acknowledgements,
subprocess shutdown, instance locks and reconnecting to the same real daemon after
closing a UI proxy. Linux GUI compilation and strict Clippy also exercise the
production custom-protocol configuration. A Windows-target cross-compilation checks
the process-token SID and restricted DACL implementation; its Windows runtime test
still requires Windows.

Compose and Railway Docker acceptance passed migrations, database/Redis readiness,
SSR, static assets, login, session cookies and Relay probes. Both profiles
used owned synthetic services and accounts; the run recorded successful cleanup
under `.artifacts/deployment/2026-11-05T07-36-27-810Z-299fb41c/`.

macOS/Windows GUI, system credential persistence, notifications/tray, signed
installation and upgrade, macOS notarization and Windows NSIS/locked-file
acceptance require their actual platforms. They have not been run locally.
Linux Desktop remains unaccepted. No installer has been published.

Before the first Tauri release, stop the old daemon explicitly, exit the previous
Desktop app and wait for the shared instance lock to release. Use a signed installer that preserves
the app identity and data directory. Configure a new Tauri update signing key and
feed. Sign in once into the new native session store; this must not reset offline
identity or automatically change remote grants. Publish only artifacts whose
selected platform matrix has passed.
