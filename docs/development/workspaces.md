# Extending workspaces

```sh
bun run workspace:list
bun run workspace:new feature-kit --kind library --target universal
bun run workspace:new feature-kit --kind library --target universal --tests --write
```

Preview is the default. Creation refuses existing paths and names. The generated
private ESM package has an explicit source export, strict tsconfig and AGENTS.md;
--tests adds an independent runner config without placeholder tests. Install with
Bun, then import the public entry from a consumer using workspace:*.

## Manifest metadata

raypx.kind is app, library or tooling. raypx.target is universal, browser, native,
node or bun. entryTargets overrides the default by exports key. sourceTargets
maps package-relative globs to targets; the most-specific matching pattern wins.
Universal code has no platform host dependencies. Bun can consume node code;
other platform crossings require a compatible explicit public entry.

Applications cannot be imported. Runtime code cannot import tooling or /testing
entries. Production imports need dependencies/peerDependencies, type imports may
use devDependencies. Cycles include all workspace dependencies. Private relative
paths and aliases cannot bypass exports. Policy also traverses each public entry
so a pure export cannot conceal DOM/host imports behind private files.

## Tasks and extraction

Turbo discovers scripts. transit propagates source changes; ^build tracks actual
artifacts. Source-only libraries need no build. API explicitly depends on Web assets;
Desktop explicitly depends on the compiled CLI. Shared runner defaults stay at root.

Extract @raypx/testing when generic fixtures repeat across consumers; it must not
import packages under test. Extract DOM app-kit for stable Web/Desktop composition,
and runtime only when another execution host directly consumes CLI internals.
Do not create these packages before those consumers exist.
