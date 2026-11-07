# Windows Bun distribution experiment

The manual **CLI size experiment** workflow's `split` mode compares three unsigned
Windows x64 distributions at one commit on one runner. Production continues to
embed the repository-pinned Bun runtime. This experiment does not build Tauri or
Desktop installers, change the runtime pin, or extract a shared execution package.

| Candidate             | Distribution                                                         |
| --------------------- | -------------------------------------------------------------------- |
| embedded-bytecode (A) | Current ESM/minified executable with depth-0 bytecode                |
| embedded-source (B)   | The same embedded runtime without bytecode                           |
| split-esm (C)         | Native `raypx.exe`, pinned `bun.exe`, bundled `cli.js` and resources |

All candidates include the same Herdr payload, licenses and format-1 immutable
inventory. C adds Bun's version-pinned license. ESM bytecode without standalone
compilation is unsupported by the pinned Bun; B distinguishes this cost from
runtime separation. Common dependencies and Herdr are prepared once. Fresh direct
compiler invocations bypass VP/Cargo build caches; report resource copy, JavaScript
compilation, launcher compilation, sealing and ZIP phases separately. Setup and
common fixture/license preparation are not candidate compilation gains.

## Running

Dispatch `.github/workflows/cli-size.yml` with `mode=split` on the experiment branch.
Only one Windows job runs. Alternatively, on Windows x64 with repository dependencies,
pinned Rust/Bun and an administrator shell with enabled Windows Firewall profiles:

```sh
bun run build:cli
bun packages/tooling/src/validation/bun-split.ts apps/cli/dist
```

The controller verifies the prepared payload, compiles isolated candidates under
`.artifacts/bun-split/`, and verifies the original payload again at completion.
It exits unsuccessfully if any candidate fails; failure logs and partial reports
remain available. The workflow retains reports/logs for seven days and does not
upload executable payloads or ZIPs by default.

## Runtime and acceptance

Only C enables the private compile-time external-Bun flag. Runtime installation
logic distinguishes the Raypx launcher, payload directory and Bun executable.
The dependency-free Rust launcher resolves an absolute sibling runtime or its
build-specific owned connector directory. CLI ownership checks still validate
version, build identity, directory and launcher digest; no user profiles migrate.
The launcher forwards Unicode arguments, inherited cwd/environment/stdio and exit
status. Windows job ownership cleans up foreground children on launcher termination.
Only the private detached daemon entry breaks away, so proxy/GUI exit preserves
background work. The startup handoff is consumed inside the CLI, never used as an
inherited Herdr source override.

Each candidate runs installed artifact acceptance, Herdr PTY acceptance, Windows
payload lifecycle and foreground launcher termination checks. Tests use temporary
profiles and synthetic providers, empty product PATHs, Unicode/spaces/# paths,
real eval and an offline bunx package. Firewall rules bind to the actual Bun process
image and known daemon/connector copies, including paths created later by installation.
The payload lifecycle removes the original distribution before opening the first
PTY through its stable connector, then restarts/stops the copied daemon. Missing
split runtime resources and changed inventory/ownership are rejected.

## Evidence and interpretation

`results.json` records commit/build identity, compiler revisions/digests, runner image,
immutable file inventories, complete payload/ZIP/component bytes, phase timings,
raw launch samples and gate results. `report.md` is also appended to the CI summary.
ZIPs use sorted entries, fixed timestamps and the same .NET Optimal compression.
The complete payload includes the inventory itself; component rows overlap it.
Embedded Bun/JS component sizes cannot be independently measured and are unavailable.

Version/providers/models each use four warmups and 25 interleaved process launches,
reporting median/P95. These are warm filesystem measurements. First daemon readiness
is separate and includes versioned copying/ACL work after enrollment and connector
setup. A fast process or small launcher alone is not acceptance or a size reduction.
Only candidates passing every functional gate are viable for a later Desktop trial.
Desktop installation, signing, updater acceptance, macOS and Linux remain untested.
