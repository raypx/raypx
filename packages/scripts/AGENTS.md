# @raypx/scripts

## Purpose

Own the repository command executable and its installation. Tooling owns command
implementation, validation, builds and VP task configuration.

## Interface

`bin/raypx-dev.mjs` registers `raypx-dev` and calls `@raypx/tooling/cli` under Bun.
Root and workspace scripts declare this package as a direct dependency when they
invoke that command. CI's minimal planner install selects this package.
For direct terminal use, run `bun link` once in this workspace with Bun's global
bin directory on `PATH`.

## Constraints

Keep the dependency direction Scripts → Tooling. Do not import private Tooling
source paths or register duplicate binaries in the root or Tooling.
Keep repository command behavior in Tooling; this package owns argument forwarding
and process startup only. It has no product runtime consumers.

## Verification

Run `bun run check`, `bun bin/raypx-dev.mjs doctor` and repository `bun run verify`.
Check the production-only filtered install when executable dependencies change.
