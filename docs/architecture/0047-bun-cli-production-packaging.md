# ADR 0047: Production Bun CLI packaging

Status: Accepted, 2026-11-07. Formalizes the existing embedded Bun CLI packaging
for both Desktop hosts.

Raypx's production CLI and daemon use the **Bun 1.4.4 stable release**, embedded
in one standalone executable compiled as minified ESM with **depth-0 bytecode**.
Root `package.json` remains the runtime pin; installation, CI and compilation
consume that pin. The complete payload includes verified Herdr resources,
licenses and the immutable format-1 `runtime.json` inventory. Embedded Bun keeps
eval and the `bun`/`bunx` shims available without a global JavaScript runtime.

Desktop consumes that same prepared CLI payload and launches it by absolute path;
it needs no separately installed CLI. Execution remains in the independent CLI
daemon over the existing private IPC, with enrollment, ownership and version
checks preserved. Consumers verify `RAYPX_CLI_PAYLOAD` and never implicitly rebuild.

The [Windows comparison](https://github.com/raypx/raypx/actions/runs/42347870137)
accepted all three candidates on the same commit and runner. Splitting Bun saved
only 0.89 MiB of complete payload and 0.42 MiB of ZIP bytes while increasing median
version startup from 100.9 to 194.5 ms. Removing bytecode saved 1.16 MiB but also
slowed startup. The [AOT investigation](https://github.com/raypx/raypx/blob/43ba637ca3a7c1ca3c11538870e2d3fdebf3057c/docs/development/bun-aot-investigation-2026-11-07.md)
found a larger executable when retaining the complete embedded runtime; smaller
trimmed candidates lost eval/bunx. The accepted choice balances complete runtime
capabilities, startup, distribution size and maintenance cost.

Production builds and releases retain the embedded bytecode configuration.
Native AOT and separate-runtime layouts remain opt-in manual experiments in the
[experimental source](https://github.com/raypx/raypx/tree/43ba637ca3a7c1ca3c11538870e2d3fdebf3057c). Changing that selection requires fresh measurements and
functional acceptance of the complete payload.

This accepts the packaging design. Signing, notarization, installers, updater
behavior and each platform's release matrix still require their own validation;
the Windows comparison does not certify other platforms or Desktop distribution.
