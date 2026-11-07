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
status. It releases its own handle to the caller's cwd so the child can change and
remove that directory. Windows job ownership cleans up foreground children on launcher termination.
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
Desktop installation, signing, updater acceptance and split distributions on macOS
and Linux remain untested.

## Windows results — 2026-11-07

[Run 42347870137](https://github.com/raypx/raypx/actions/runs/42347870137)
passed at source commit `fe93b9ec6ab65c622adab539fe3da36aac9e3f94`.
All three candidates passed every selected functional gate and final temporary
directory cleanup. Only the `split` Windows job ran; the size/AOT jobs were skipped.
The runner image was `win25-vs2026`, version `20261103.298.1`, using Bun 1.4.4
revision `38afee6c84fcf48c0edb2466aa4b27d287a59c30` and Rust 1.99.1.

| Candidate            | Complete MiB | ZIP MiB |      Complete vs A |           ZIP vs A | Packaging seconds |
| -------------------- | -----------: | ------: | -----------------: | -----------------: | ----------------: |
| A: embedded bytecode |       141.16 |   62.93 |                  — |                  — |             11.56 |
| B: embedded source   |       140.00 |   62.37 | -1.16 MiB (-0.82%) | -0.56 MiB (-0.89%) |              9.24 |
| C: split ESM         |       140.27 |   62.51 | -0.89 MiB (-0.63%) | -0.42 MiB (-0.67%) |             10.93 |

Component sizes overlap those totals. Herdr is **27.80 MiB** in every candidate.
A/B executables, including Bun/JS, are 113.34/112.18 MiB. C contains a 0.24 MiB
launcher, **109.94 MiB Bun** and 2.25 MiB JavaScript, plus licenses/inventory/resources.

| Candidate | Resource copy ms | JS build ms | Launcher build ms | Seal ms |  ZIP ms |
| --------- | ---------------: | ----------: | ----------------: | ------: | ------: |
| A         |             32.6 |       656.8 |               0.0 |   254.2 | 10619.7 |
| B         |             22.8 |       480.7 |               0.0 |   243.7 |  8490.9 |
| C         |             56.4 |       165.4 |            2026.1 |   250.8 |  8427.7 |

Common preparation: production reference build graph, including Herdr preparation, 14.92 s;
offline fixture and license 88.2 ms; native launcher test compilation/execution
1.99 s. Rust installation and dependency installation are workflow setup, outside
candidate packaging. These are one uncached build per candidate, not repeated build
time distributions; ZIP dominates the total and these numbers do not establish a
general CI speedup.

Process launches below are **median / P95 milliseconds**, after four warmups with
25 interleaved samples per command/candidate. First daemon readiness is a separate
single measurement including the managed copy and ACL work.

| Candidate |   `--version` |     Providers |        Models | First daemon ready ms |
| --------- | ------------: | ------------: | ------------: | --------------------: |
| A         | 100.9 / 113.9 | 112.9 / 128.7 | 118.4 / 131.4 |                1318.8 |
| B         | 178.7 / 201.5 | 189.6 / 210.0 | 195.0 / 220.9 |                1466.5 |
| C         | 194.5 / 222.1 | 205.4 / 245.6 | 204.5 / 238.9 |                1366.2 |

**Recommendation: retain A for production.** C saves only 0.89 MiB installed and
0.42 MiB downloaded, while median launches are 92.8% slower for version, 81.9%
slower for providers and 72.7% slower for models. B is itself 0.27 MiB installed /
0.14 MiB ZIP smaller than C, so the small saving comes from removing bytecode;
separating Bun adds no size benefit here. C also introduces a Rust launcher build
and another runtime layout to maintain. Its functional acceptance supports later
experiments, but does not justify switching packaging or prove Desktop independence.

The workflow's `bun-split-windows` artifact contains raw samples, immutable
inventories, build/acceptance logs and daemon timing files for seven days. Full
executables and ZIPs were not uploaded. Production payload selection is unchanged.

## Repository validation

CLI and Tooling type checks, focused installation/connector/diagnostic tests, Policy
and Knip pass. The Windows job also runs the correlation-logging regression before
building candidates. Candidate probes check inherited cwd, deletion after changing
directory, and preservation of a nonzero runtime exit status.

Herdr owner termination now checks every captured descendant, including its default
shell and ConPTY helper. The experiment exposed an existing Windows leak: terminating
the owner also killed its EOF guardian before cleanup could run. The guardian now
runs independently on Windows, receives EOF when the owner's pipe closes, and waits
for its existing process-tree cleanup. No background task or terminal is preserved by
this guardian; it exists to finish shutdown.

The experiment exposed a diagnostic issue: generic credit-card redaction could
mask the numeric prefix of a valid UUID, breaking job/event correlation. The
regression preserves complete v4 UUIDs only in `id`/`jobId`, while checking that
numeric credentials, email addresses and private fields remain redacted.

Local `bun run verify` completed **61/63** tasks. Two baseline failures are recorded
separately from Windows payload acceptance: CLI's SQLite profile snapshot test
(`tests/integration/runtime/sqlite.test.ts:286`, `unable to open database file`),
and Web's happy-dom teardown `AbortError`. The CLI suite otherwise passed 467 tests
with one skipped. This is not a passing repository-wide verification result.
