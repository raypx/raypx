# Bun AOT investigation — 2026-11-07

Research evidence, not an accepted runtime migration. The production pin remains
Bun 1.4.4. This note distinguishes upstream implementation facts, Raypx source
observations and experiments that still need executable evidence. It does not
replace the Windows or macOS release gates.

## Availability and exact identities

**AOT is implemented and obtainable in the current official canary; it is absent
from the pinned stable 1.4.4.** The website's experimental `bun compile` describes
the newer compiler, not a hidden optimization already enabled by Raypx's build.
The latest stable release metadata still identifies 1.4.4, published
2026-10-22, at `38afee6c84fcf48c0edb2466aa4b27d287a59c30`. That revision has
no `src/aot` directory or `compile` command dispatch, and its
`CompileBuildOptions` has no `aot` or executable `trim` property.
[Stable release metadata](https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.4.4),
[stable command dispatch](https://github.com/oven-sh/bun/blob/38afee6c84fcf48c0edb2466aa4b27d287a59c30/src/runtime/cli/mod.rs#L790),
[stable build types](https://github.com/oven-sh/bun/blob/38afee6c84fcf48c0edb2466aa4b27d287a59c30/packages/bun-types/bun.d.ts#L3737).

The inspected upstream main commit is
`b1305ddc7ceebad383019d796d1367cc68f66ba0`. The canary release body identifies
the same commit. Its implementation includes a Rust compiler front end,
JavaScriptCore compiler bindings, executable writing and a runtime trim planner.
This is source evidence beyond documentation examples.
[Canary metadata](https://api.github.com/repos/oven-sh/bun/releases/tags/canary),
[Rust compiler](https://github.com/oven-sh/bun/tree/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/aot),
[JSC bridge](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/jsc/bindings/BunAOTCompile.cpp),
[executable build](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/runtime/cli/compile_command/build.rs).

For an isolated experiment, use the official release assets below and verify the
archive digest and extracted `bun --revision`. Do not update the repository pin
or install over the production compiler. The `canary` download URL is mutable;
the asset ID, digest, source commit and executable revision identify the tested
compiler. A release's display name or the Git `canary` tag alone is insufficient.
[Official asset metadata](https://api.github.com/repos/oven-sh/bun/releases/tags/canary).

| Platform    | Official archive                                                                                         | Asset ID    | Archive SHA-256                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Windows x64 | [bun-windows-x64.zip](https://github.com/oven-sh/bun/releases/download/canary/bun-windows-x64.zip)       | `715114439` | `c7448cb32fd91f32135a455f032365c48e8c5404d5eba844b179b8f97b5397d4` |
| macOS arm64 | [bun-darwin-aarch64.zip](https://github.com/oven-sh/bun/releases/download/canary/bun-darwin-aarch64.zip) | `715112809` | `6ba711d69afea6b790d312f4353c75562f16ba230c48afdf442ba09827053a19` |

The investigation coordinator separately verified that the official macOS asset
reports `1.4.4-canary.1+b1305ddc7` and exposes `compile --help`. That command
availability is not a Raypx compatibility or Windows acceptance result.

## What changes compared with today's executable

| Build                                       | Executable contents and execution                                                                | Practical implication                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `bun build --compile`                       | Bundled JavaScript plus Bun, with interpreter/JIT                                                | Current stable standalone deployment model; no global Bun installation required.                        |
| The above plus `--bytecode`                 | Also embeds a bytecode cache; JIT remains                                                        | Avoids some startup parsing. It does not remove the runtime. Depth 0 caches only module top-level code. |
| `bun compile` / `bun build --compile --aot` | Compiles reachable application and library code to machine code; no JIT for the compiled program | Whole-program type checking and different runtime constraints; distinct from bytecode caching.          |
| AOT plus `--trim`                           | Also removes native Bun/Node API features proved unused                                          | Potential runtime-size reduction, limited by actual feature use and unseen code.                        |

These distinctions are documented in the
[compiler overview](https://bun.com/docs/compiler),
[bytecode guide](https://bun.com/docs/compiler/bytecode),
[AOT internals](https://bun.com/docs/compiler/internals) and
[trim guide](https://bun.com/docs/compiler/size).

AOT uses the JavaScriptCore backend at build time; it still ships the event loop,
garbage collector and required native APIs. Code produced later through `eval`,
`new Function` or `node:vm` is interpreted. It does not turn the application into
a dependency-free Rust/Go-style executable. The compiler's own TypeScript 7
checker runs before code generation; a normal application's type error stops
the build even if `tsc` passed under a different version/configuration.
[Internals](https://bun.com/docs/compiler/internals),
[type-checking troubleshooting](https://bun.com/docs/compiler/troubleshooting).

Raypx currently compiles `apps/cli/src/main.ts` directly with ESM, minification,
bytecode and `bytecodeDepth: 0`. Under AOT, bytecode and depth settings have no
effect; upstream explicitly tests this. AOT is therefore a different compiler
experiment, not another depth setting.
[Raypx build at dfe5f2b2](https://github.com/raypx/raypx/blob/dfe5f2b2f43f8484e9ac3e82cd05e569457b5c12/apps/cli/scripts/build.ts#L26),
[upstream bytecode/AOT tests](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/test/cli/aot-options-without-effect.test.ts).

## Windows and build-platform constraints

AOT only builds for the platform running the compiler. Source enforces the
default target and returns `CrossCompilation` for another one; ordinary
`bun build --compile` remains the cross-compilation alternative. A Windows x64
Raypx AOT experiment should therefore run on Windows x64. A macOS-hosted
cross-compiled empty Windows executable measures ordinary compile, not AOT.
[Target check](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/runtime/cli/compile_command/build.rs#L327),
[AOT platform documentation](https://bun.com/docs/compiler/aot).

Windows is present in the implementation: the builtin table generator includes
Windows, the trim linker handles COFF, and upstream executable tests account for
Windows `.exe` output. There is no Windows-only rejection in the inspected AOT
request check. Builds can explicitly omit AOT, so a matching version string alone
does not prove that a particular compiler includes it.
[Builtin targets](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/scripts/build/aot.ts#L27),
[COFF trim linker](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/scripts/build/trim/linker-coff.ts),
[executable tests](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/test/bundler/compile-aot-size.test.ts#L135),
[compiler-absent implementation](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/aot/absent/lib.rs).

One source condition needs care: building Bun itself **on a Windows host**
disables its `trimmable` configuration. This does not establish that the official
Windows release cannot trim. Official CI cross-compiles Windows Bun on Linux,
and its `ci-build` profile requests `trimmable: true`. A compiler lacking trim
tables can copy the complete runtime when trim was not explicitly requested;
explicit trim reports an error. Measure the actual Windows release asset.
[Build configuration](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/scripts/build/config.ts#L1520),
[official Windows build lanes](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/.buildkite/ci.ts#L284),
[CI profile](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/scripts/build/profiles.ts#L171),
[trim fallback](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/runtime/cli/compile_command/trimming.rs#L86).

## Raypx compatibility and product constraints

**The same-binary embedded Bun is a required capability.** Raypx's `bun` and
`bunx` shims set `BUN_BE_BUN=1` and execute the existing Raypx CLI. Windows uses
a directory junction and batch shims; it does not copy a second Bun binary.
Any claimed reduction must preserve both running arbitrary child scripts and
resolving/executing package binaries through these shims.
[Raypx shim implementation](https://github.com/raypx/raypx/blob/dfe5f2b2f43f8484e9ac3e82cd05e569457b5c12/apps/cli/src/runtime/process/bun.ts#L25),
[CLI constraints](https://github.com/raypx/raypx/blob/dfe5f2b2f43f8484e9ac3e82cd05e569457b5c12/apps/cli/AGENTS.md).

Default AOT removes the Bun command line and JIT. Trim's `cli` feature explicitly
includes the package manager, `bunx`, test/build tools and compiler. Upstream
tests expect a trimmed executable's `BUN_BE_BUN=1 ... install` to fail with exit
70 while **`--version` still succeeds**. Version-only smoke tests cannot certify
Raypx's embedded-runtime capability.
[Trim feature definitions](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/trim/features/trim-features.def#L1),
[BUN_BE_BUN tests](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/test/bundler/compile-trim-runtime.test.ts#L295).

Retaining `cli` alone is insufficient: `--eval` requires all Program runtime
features, and `bunx` also requires runtime package/config loading. The fuller
public configuration under investigation is:

```ts
await Bun.build({
  entrypoints: ["./experiment/raypx-bundle.js"],
  target: "bun",
  format: "esm",
  define: { __RAYPX_CLI_BUILT_AT__: String(Date.now()) },
  compile: {
    outfile: "./experiment/raypx.exe",
    aot: true,
    inspector: true,
    allowCodeFromDisk: true,
    autoloadPackageJson: true,
    autoloadTsconfig: true,
    trim: { allow: ["cli", "interpreter", "jit"] },
  },
});
```

An object `trim` enables trimming, and `allow` retains named features plus their
dependencies. `inspector: true` admits unknown code and preserves all Program
APIs, without starting an inspector listener. This also changes optimization
assumptions; timings from this mode must be labelled separately from default AOT.
Keeping only the named CLI/interpreter/JIT features can still reject `--eval`
when another Program API was removed. Retaining the full runtime can erase the
advertised size reduction.
[Public API](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/packages/bun-types/bun.d.ts#L3866),
[runtime-code requirements](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/trim/removable_features/requirement.rs#L20),
[inspector retention](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/trim/decide.rs#L228).

| Concern                        | Established fact                                                                                                                                                                              | Raypx implication / unresolved experiment                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod 4.6.7                      | Raypx locks Zod 4.6.7. Zod's `Doc.compile()` uses a `Function` constructor; `jitless` avoids its eval probe. Bun recommends `z.config({ jitless: true })` before schema construction for AOT. | Potential interpreted validation hot path and retained parser/interpreter. No Raypx `jitless` initialization was found in the inspected CLI/Core/Contracts source. Measure the actual schema path before changing global configuration. |
| Pi SDK 1.5.0                   | Raypx selects literal lazy API imports. Pi's OpenAI lazy module uses a literal dynamic import; its OAuth loader separately uses computed imports and offers bundled loaders.                  | Literal lazy import is not inherently incompatible. Verify selected providers and the actual reachable graph; existence of a computed OAuth loader does not prove it is reached by Raypx.                                               |
| `eval` / generated functions   | AOT interprets runtime-generated code. String-code bans can remove parser/interpreter support but make some libraries fail or use fallback paths.                                             | Do not equate successful compilation with equivalent validation speed or assume string-code banning is free.                                                                                                                            |
| Dynamic code loading           | The compiler embeds reachable modules. Arbitrary disk code needs external entries or `--aot-allow-code-from-disk`, and that code is interpreted.                                              | Check child scripts, optional loaders and SDK paths in a clean machine/profile, not just on the source checkout.                                                                                                                        |
| SQLite and child processes     | AOT docs cover Bun/Node modules, and `sqlite`/`spawn` are explicit trim feature groups. Raypx imports `bun:sqlite` and uses child processes.                                                  | No primary-source basis for claiming these APIs are unsupported. Verify database lifecycle, daemon spawning, IPC and terminal behavior in the executable. Their required runtime code cannot be counted as removable.                   |
| Builtin mutation and debugging | AOT restricts replacing builtin members; compiled-code breakpoints are unavailable.                                                                                                           | Inspect any dependency/polyfill that mutates prototypes; preserve diagnostics and exercise actual runtime paths.                                                                                                                        |

Sources for the table:
[Raypx catalogs](https://github.com/raypx/raypx/blob/dfe5f2b2f43f8484e9ac3e82cd05e569457b5c12/package.json),
[Zod 4.6.7 generated functions](https://github.com/colinhacks/zod/blob/b500a2ee95134f81d74da7911d7378dd2853d042/packages/zod/src/v4/core/doc.ts),
[Zod jitless probe](https://github.com/colinhacks/zod/blob/b500a2ee95134f81d74da7911d7378dd2853d042/packages/zod/src/v4/core/util.ts#L517),
[Raypx provider selection](https://github.com/raypx/raypx/blob/dfe5f2b2f43f8484e9ac3e82cd05e569457b5c12/packages/ai/src/providers.ts#L8),
[Pi 1.5.0 literal lazy import](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/src/api/openai-completions.lazy.ts),
[Pi computed OAuth loader](https://github.com/earendil-works/pi/blob/f9a26365568127461c47a07a37dcb42c140a3ac5/packages/ai/src/auth/oauth/load.ts),
[Bun compatibility](https://bun.com/docs/compiler/compatibility),
[Bun trimming limits](https://bun.com/docs/compiler/size).

## Windows executable evidence

The first native Windows x64 experiment used the exact canary archive above and
the prepared stable CLI from the same checkout. MiB means bytes / 1,048,576;
gzip is level 9 over the executable alone, excluding the unchanged Herdr payload.
[First run](https://github.com/raypx/raypx/actions/runs/42317610192).

| Candidate                                                 | Executable MiB | gzip MiB | Observed behavior                                             |
| --------------------------------------------------------- | -------------: | -------: | ------------------------------------------------------------- |
| Production CLI, stable 1.4.4, depth-0 bytecode            |         113.34 |    52.94 | Reference                                                     |
| Empty stable executable                                   |         109.93 |    51.84 | Program, eval and offline bunx passed                         |
| Empty canary JIT executable                               |         142.94 |    69.74 | Program, eval and offline bunx passed                         |
| Empty AOT + trim                                          |          37.69 |    16.92 | Program passed; embedded Bun CLI removed                      |
| SQLite/spawn/HTTP AOT + trim fixture                      |          47.81 |    21.37 | All three fixture operations passed; embedded Bun CLI removed |
| Actual CLI, prebundled JS, AOT + trim                     |          90.12 |    41.75 | Version/provider/model catalogs passed; eval and bunx failed  |
| Actual CLI, prebundled JS, AOT + trim allowing only `cli` |         155.15 |    74.29 | Catalogs passed; eval and bunx still failed                   |

The 90.12 MiB result is a 20.5% reduction in the executable, but it cannot serve
as a drop-in Raypx CLI: it loses the existing embedded script/package runner.
The 37.69 MiB hello-world floor is not a Raypx package measurement. First-run
workflow success means the investigation completed, not production acceptance;
CLI/Herdr acceptance was skipped because no actual CLI passed all prerequisite
runtime probes.

Direct TS AOT initially failed with 34 TS1287 diagnostics in the AI/Instances
workspaces. These packages already declare ESM, but their NodeNext configs were
classified as CommonJS by this experimental checker. A generated global
ESNext/Bundler tsconfig override resolved these diagnostics and produced native
executables. Production TypeScript configs remain unchanged.
[Top-level tsconfig override API](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/packages/bun-types/bun.d.ts#L3671).

The [second run](https://github.com/raypx/raypx/actions/runs/42318682039) established
the cost of retaining arbitrary script execution and offline bunx. The
[final run](https://github.com/raypx/raypx/actions/runs/42319572120) reproduced the
sizes and passed installed CLI/Herdr smoke on the smallest full-runtime candidate.
The tables below use that final run. All four actual-CLI variants passed
version/provider/model catalogs. Full-runtime variants additionally passed eval
and the offline package binary; trim-only variants lost both capabilities.

| Actual CLI candidate                       | Executable MiB | gzip MiB |         Native build seconds | Embedded eval/bunx |
| ------------------------------------------ | -------------: | -------: | ---------------------------: | ------------------ |
| Stable reference, depth-0 bytecode         |         113.34 |    52.94 | Not timed in this experiment | Existing behavior  |
| Direct TS + config override + trim         |          90.71 |    42.00 |                        26.49 | Removed            |
| Direct TS + config override + full runtime |         173.65 |    82.88 |                        26.29 | Passed             |
| JS prebundle + trim                        |          90.12 |    41.75 |                        25.00 | Removed            |
| JS prebundle + full runtime                |         169.02 |    80.92 |                        24.69 | Passed             |

Native build timings cover the experimental compiler invocation, not dependency
installation, JS prebundling, hashing/compression or the full CI job. Full runtime
uses the inspector-retention configuration above. Even an empty program in that
mode is 146.32 MiB (71.21 MiB gzip). The actual smallest retained-runtime CLI is
49.1% larger than stable, or 52.8% larger when gzipped. Canary's own JIT floor is
already larger than stable's, so this is a comparison of the tested release
artifacts, not a claim that AOT inherently makes every Bun version larger.

Warm process launches used the same Windows runner, four warmups and 25 samples
per command/candidate, alternating candidate order each round. Values are median
/ p95 milliseconds, including process creation and command execution:

| Candidate                   | `--version` | `ai providers --json` | `ai models --json` |
| --------------------------- | ----------: | --------------------: | -----------------: |
| Stable reference            | 72.2 / 79.1 |           88.3 / 95.5 |        80.9 / 84.4 |
| Direct TS + trim            | 30.4 / 35.2 |           32.1 / 33.4 |        32.2 / 33.8 |
| Direct TS + full runtime    | 31.5 / 38.3 |           34.3 / 46.0 |        34.6 / 35.2 |
| JS prebundle + trim         | 32.0 / 37.7 |           34.1 / 46.8 |        34.2 / 34.8 |
| JS prebundle + full runtime | 34.7 / 39.9 |           36.7 / 45.5 |        36.0 / 37.1 |

The retained-runtime AOT CLI reduced these startup medians by 51.9–58.5%.
These are repeated short commands, not cold-disk launch, daemon throughput,
provider latency, memory usage or long-running agent work. Compiler logs also
show interpreted regular-expression warnings in Zod; successful catalogs do not
prove validation performance equivalence.

The second run's full smoke step stopped at payload inventory validation:
Windows bunx had generated `bun-node/bun.exe` and `bun-node/node.exe` aliases
beside the experimental executable after sealing. This was an experiment
side effect, before product smoke assertions ran. The harness removes these
generated aliases and re-verifies the sealed inventory before handing it to
acceptance. The final run passed this verification and both smoke commands.

These aliases are hard links to the current Raypx/Bun executable, not a Node.js
installation or another runtime payload. Bun chooses the adjacent directory
when Windows' temporary directory is on another drive; it creates both names
with `CreateHardLinkW` targeting its own process image.
[Path selection](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/install/lib.rs#L420),
[hard-link creation](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/install/lib.rs#L683).

The final Windows smoke ran outside the repository with an empty PATH and passed
Pi AI streaming, managed tool approvals and daemon restart/resume. Herdr through
CLI RPC also passed fast-exit retention, exit status, input, resize, cancellation,
cursor queries, alternate screen, bracketed paste, supervisor EOF and descendant
cleanup. This certifies these smoke paths on this candidate, not a complete
Desktop distribution or every API of the embedded runtime.

Local evidence: `.artifacts/bun-aot/windows-42317610192/`,
`.artifacts/bun-aot/windows-42318682039/` and
`.artifacts/bun-aot/windows-42319572120/`, including raw probe stdout/stderr,
compiler logs and full job logs. Executables are not published.

**Current recommendation:** retain stable depth-0 compilation for Raypx. The
tested AOT compiler offers useful startup improvements, but provides size savings
only when existing embedded-runtime capabilities are removed. Configurations
retaining the arbitrary-code runtime are larger despite passing the selected
Windows smoke tests. Do not upgrade the production pin solely for this experiment.

## Evidence still required before adoption

The experiments do not justify changing the runtime pin. A tiny hello world is
useful for compiler availability and the runtime floor; it is not a Raypx
package, startup or memory measurement.

The selected Windows smoke covers the installed CLI, provider/daemon and terminal
paths listed above. Runtime-generated validation performance, representative
RSS/long-running work, Desktop installed GUI behavior and the complete release
platform matrix remain unmeasured. Compiler success and catalog startup timings
do not establish equivalence for those paths.

macOS release acceptance is unrun; no additional macOS CI is required merely to
answer the current Windows feasibility question. Later experiment results must
carry their own run/artifact evidence rather than being inferred from website
size examples.

## Experiment implementation checks

Tooling's 48 test files passed: 262 tests passed and one skipped. Tooling type
checking, focused lint/format, repository policy and Knip passed. Knip explicitly
records the standalone experiment as an entry because its consumer is the
manual workflow rather than the normal developer CLI.

The local daily `bun run verify` was not green: 61/63 tasks succeeded. CLI's
baseline-profile SQLite integration failed with `unable to open database file`,
and Web reported unhandled `AbortError` rejections while its assertions passed.
These are recorded separately from native AOT executable results. No macOS CI,
installer/signing acceptance or complete release matrix was run for this note.
