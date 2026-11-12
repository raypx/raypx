# ADR 0058: Derived source platforms

Date: 2026-11-12

Status: Accepted. Supersedes the `raypx.sourceTargets` declaration in
[ADR 0043](0043-package-surfaces.md).

## Context

Mixed workspaces declared each platform boundary twice: `raypx.entryTargets` named
the target of an export and `raypx.sourceTargets` repeated it as globs over the files
behind that export. Twenty-two manifests carried such globs. Most of the remaining
entries described configuration, scripts and acceptance suites that the boundary check
never reads, because it examines runtime source directories only.

Policy already walks every export transitively with the entry's target, so the globs
added no constraint to a file an export reaches.

## Decision

A file's platform is derived, never declared:

1. A file reached from package exports through runtime imports takes the targets of
   those entries. Reached by several, it must satisfy each: Node and Bun entries
   combine to `node`, any other combination to `universal`.
2. Configuration files, `.storybook/main`, `scripts/`, `e2e/`, `tests/` and top-level
   `perf/` files run under Bun.
3. Every other file takes the workspace `raypx.target`.

Type-only imports carry no platform. Policy rejects a declared `sourceTargets`.
Boundary checks and browser change scopes share the derivation in Dev CLI's
`src/repo/platforms.ts`; Task Graph no longer resolves source platforms.

## Consequences

- A platform boundary is declared once, on the export.
- A source file no export reaches cannot be stricter than its workspace target. A
  pure module that needs the `universal` guarantee is exported through a universal
  entry or lives in a universal workspace.
- Files reached by both a universal and a platform entry are checked as universal in
  the per-file pass as well as the transitive one.
