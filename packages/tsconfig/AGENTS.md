# @voidmix/tsconfig

## Purpose

Shared strict TypeScript presets. Every workspace extends one of them.

## Interface

| Path                   | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `./base.json`          | strict compiler defaults shared by everything |
| `./node.json`          | base plus Bun's Node-compatible runtime types |
| `./browser.json`       | base plus browser types                       |
| `./library.json`       | base preset for non-React packages            |
| `./react-library.json` | base preset for React packages                |

See [Toolchain](../../docs/architecture/tooling.md) for the preset-to-workspace
matrix.

## Ownership

- Own compiler behaviour shared by every workspace.
- Own nothing consumer-specific: no `include`, `exclude`, `rootDir`, `outDir`,
  `paths`, project references, or app-specific `types`.

## Constraints

- `verbatimModuleSyntax` and `exactOptionalPropertyTypes` are inherited from
  `base.json`. **Never disable either**; the whole repository's idioms depend on
  them (`import type`, and conditional spread instead of `key: undefined`).
- Keep Bun-specific types and APIs in the Node preset rather than the shared base.
- Full TypeScript project references are deliberately deferred until editor or
  whole-repository type checking becomes measurably slow.

## Verification

Verified through every consuming workspace rather than directly:

```bash
bun run check
```
