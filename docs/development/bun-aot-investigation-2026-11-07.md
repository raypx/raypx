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

There is a source-supported experiment to retain the CLI:

```ts
await Bun.build({
  entrypoints: ["./apps/cli/src/main.ts"],
  target: "bun",
  format: "esm",
  define: { __RAYPX_CLI_BUILT_AT__: String(Date.now()) },
  compile: {
    outfile: "./experiment/raypx.exe",
    aot: true,
    trim: { allow: ["cli"] },
  },
});
```

An object `trim` enables trimming, and `allow` retains named features plus their
dependencies. The planner seeds retained features from `allow` before removing
unused features. This makes CLI retention a legitimate test, not proof that
arbitrary child code, JIT behavior or all APIs in unbundled children survive.
Retaining these features can erase much of the advertised size reduction.
[Public API](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/packages/bun-types/bun.d.ts#L3866),
[planner](https://github.com/oven-sh/bun/blob/b1305ddc7ceebad383019d796d1367cc68f66ba0/src/trim/decide.rs#L122).

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

## Evidence still required before adoption

The source findings justify an isolated **Windows-first** experiment. They do
not justify changing the runtime pin or promising a package-size percentage.
Compare stable JIT/bytecode, canary JIT/bytecode, canary AOT, AOT+trim and
AOT+trim retaining the embedded CLI against the same Raypx commit. A tiny hello
world is useful for compiler availability and the runtime floor; it is not a
Raypx package, startup or memory measurement.

For every viable candidate, record compiler revision/digest, complete payload
inventory and compressed/uncompressed sizes. Run the real CLI's help/catalog,
SQLite/profile, daemon/IPC, process/terminal and provider paths, plus
`BUN_BE_BUN=1` script execution and offline package-bin execution through `bunx`.
Check runtime-generated validation, error/stack behavior and representative
startup/RSS/long-running work. Compiler success alone does not pass these gates.

At the time of this source note, the coordinator's Windows executable and full
Raypx AOT probes were pending. The research agent did not run them. macOS
release acceptance is also unrun; no additional macOS CI is required merely to
answer the current Windows feasibility question. Any later experiment results
must be attached with their own run/artifact evidence rather than inferred from
the website's size examples.
