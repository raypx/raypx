# ADR-0023: Worker Vite and Nitro artifact

## Status

Superseded by ADR-0025

Only the dual-entry artifact provisions are superseded by
[ADR-0025](0025-worker-single-entry-execution.md). The Vite+/Nitro build,
dependency tracing, complete artifact cache and development-watch decisions
remain in force. The record below preserves the original two-entry decision.

Supersedes only the Worker compilation/runtime-preparation split in
[ADR-0018](0018-turbo-task-orchestration.md). Turbo remains the sole workspace
task runner and cache; Vite+ remains the leaf toolchain.

## Context

Worker's custom esbuild entry and package-copying implementation duplicated the
server build responsibilities already owned by Vite+ and Nitro. Its compile-only
cache needed a separate uncached preparation task to restore runtime package
assets, making a build depend on two independently maintained pipelines.

Worker also has two executable entries: the durable host and its isolated Run
runner. It needs the same Pi and document-package assets after deployment, while
its startup and graceful shutdown remain process lifecycle operations.

## Decision

Build Worker through `vp build` with the Nitro Vite plugin. Keep Vite workspace
resolution in `vite.config.ts` and executable packaging in `nitro.config.ts`.
Use Nitro's `bun` preset with the entry overridden to `src/main.ts` and a second
Rolldown input for `src/runner-main.ts`. The output is
`.output/server/index.mjs` and `.output/server/runner.mjs`, with shared chunks
beside them so the host can locate the Runner relative to its module URL. The
custom entry starts the durable worker without an HTTP listener.

Nitro owns external dependency tracing and package copying. Explicit `traceDeps`
entries retain complete Pi and document-package assets; bundled workspace code
and React Email's runtime entry do not need a separate copying implementation.
Remove the custom esbuild builder, package-closure implementation and
`runtime:prepare` task. Cache the complete `.output/**` artifact as one Turbo
build result, including its runtime dependencies and assets.

Keep `scripts/dev.mjs` as a thin Vite builder-watch adapter. Restart the compiled
host only after Nitro finishes a successful build, gracefully stopping the old
host first and using the current Bun executable for the replacement. Failed
builds leave the current host running. Root build scripts still run the graph's
checks and dependency builds; runtime and real document probes stay uncached.

## Consequences

Worker has the same Vite+/Nitro build boundary as the HTTP applications, while
retaining its two process entries and durable execution lifecycle. Bun 1.4.0
runs the compiled host and isolated Runner.

A cache hit restores a complete deployment directory. Archiving package assets
increases cache size compared with compile-only results, but eliminates the
separate runtime-preparation pass and its dependency on source resolution during
restoration. Cache fingerprints, trust rules and pruning remain defined by
ADR-0018.

Relocated-artifact and document smoke checks must verify package assets and both
entries. Container document acceptance still requires the pinned converters and
fonts; Nitro does not supply those system dependencies.

## Follow-up

Revisit explicit trace coverage when Pi or document dependencies change. Revisit
the artifact cache boundary if measured archive size or cache duration outweighs
the simpler complete-artifact restoration.
