# ADR 0061: Standalone Vitest

Date: 2026-11-12

Status: Accepted. Updates the leaf test runner decision in
[ADR 0060](0060-turbo-task-graph.md).

## Decision

Workspace test scripts call `bun --bun vitest run`. Test sources import from
`vitest` and configurations import from `vitest/config`. The dev catalog pins
Vitest and its V8 coverage provider together. Turbo runs the workspace scripts
through the existing graph and cache. Vite+ provides application builds,
formatting and linting. The repository uses its existing Vite alias for the test
transform pipeline.

The root `vitest.config.ts` discovers workspace configurations from the manifest.
Each workspace owns its test layers and environment. Existing tests depend on
Vitest features including hoisted mocks, project configuration and happy-dom.
The [testing guide](../development/testing.md) lists the supported entry points.
