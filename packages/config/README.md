# @raypx/config

Engineering tool package, does not participate in product runtime, no initial build needed.

Shared TypeScript static configuration now independent in [`@raypx/tsconfig`](../tsconfig/README.md), this package preserves engineering tools.

- `@raypx/config/vite`: packageConfig, transitive dependency cache input, precise source aliases, and Start server import protection rules.
- `@raypx/config/check-boundaries`: TypeScript AST package boundary validation, detects illegal dependencies, cycles, internal paths, server modules in browser, Node built-ins, and `bun`, `bun:*` built-ins.
- `@raypx/config/environment`: `checkDevelopmentEnvironment` validates project-fixed development tool versions and declaration consistency.

Style tools handle UI CSS copying, cleanup, and watching. Source and public tool entrypoints directly use `.ts`, relative imports also preserve `.ts` extension, do not depend on generated JavaScript or declaration files.
Internal boundary and style scripts execute with Bun; Vite+ loads same tools via Node.js 22.21.1 native type stripping.
`tsconfig.test.json` noEmit configuration allows TS extension imports, runtime package tsc ESM and declaration output conventions remain unchanged.
Preserve tsc checking, do not replace type validation with Bun executable TypeScript.

Root directory `bun run check:boundaries` runs checking; config itself has real boundary, task, alias, and style tests. When adding packages or exports, synchronously update allowed dependency rules and tests.

`bun run check:env` directly runs `src/environment.ts` with Bun, no dependency installation needed.
Root `preinstall` and public root script pre hooks call same entrypoint, CI explicitly executes before frozen install.
Checks actual Node.js 22.21.1, Bun 1.4.0 in PATH and available package manager identifier,
requires `devEngines`, `.node-version`, `.bun-version`, `packageManager`, and `engines.bun` consistency.
On version or declaration mismatch outputs actual vs expected values and exits non-zero.
Bun 1.4.0 itself does not enforce `devEngines`, this tool only supports current project's exact versions and `onFail: "error"` declaration,
does not provide auto-download or universal npm schema implementation. Node development toolchain and Bun production runtime remain unchanged.

Author: Zack <heyloyep@gmail.com>
