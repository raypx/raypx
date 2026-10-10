# @raypx/tsconfig

Shared TypeScript configurations for the Raypx monorepo. This package contains only static JSON files;
it has no runtime code, build step, or placeholder tests. Engineering tasks and boundary tools remain in
[`@raypx/config`](../README.md).

## Available Configurations

### `@raypx/tsconfig/base.json`

Strict common settings for tooling and applications.

**Usage:**

```json
{
  "extends": "@raypx/tsconfig/base.json"
}
```

**Features:**

- ES2022 target and library
- Strict mode, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax`
- ESNext modules with Bundler resolution
- Consumers define their own source paths and environment types

### `@raypx/tsconfig/build.json`

Package emission settings, based on the strict common configuration.

**Usage:**

```json
{
  "extends": "@raypx/tsconfig/build.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Features:**

- NodeNext modules and resolution for ESM package output
- Declaration files, declaration maps, and source maps
- No implicit environment types
- Source/output directories and include/exclude patterns belong to each consuming package

### `@raypx/tsconfig/test.json`

No-emit configuration for source, tests, and Vite task configuration.

**Usage:**

```json
{
  "extends": "@raypx/tsconfig/test.json",
  "compilerOptions": {
    "rootDir": "../.."
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

**Features:**

- Inherits React JSX, DOM, and Node types for the workspace's test/tooling checks
- ESNext modules with Bundler resolution
- `noEmit` and `allowImportingTsExtensions`
- Consumers explicitly include their source, tests, and configuration files

This preset is a TypeScript checking configuration, not a Vitest runtime configuration.
Bun execution and Node type stripping do not replace `tsc` checks.

### `@raypx/tsconfig/node.json`

Extends `build.json` with Node.js types. Non-React runtime packages use this preset and define their own
`rootDir`, `outDir`, and `include`.

```json
{
  "extends": "@raypx/tsconfig/node.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

### `@raypx/tsconfig/react.json`

Extends `node.json` with `react-jsx` and DOM libraries. The Hooks and UI packages use this preset for
ESM and declaration output.

```json
{
  "extends": "@raypx/tsconfig/react.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## Package Structure Example

```text
packages/your-package/
├── src/
├── test/
├── tsconfig.json          # Runtime package build configuration
├── tsconfig.test.json     # No-emit source, test, and tooling checks
├── vite.config.ts         # Tasks and Vitest environment
└── package.json
```

**tsconfig.json** (for building a non-React runtime package):

```json
{
  "extends": "@raypx/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**tsconfig.test.json** (for checking source, tests, and Vite configuration):

```json
{
  "extends": "@raypx/tsconfig/test.json",
  "compilerOptions": {
    "rootDir": "../.."
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

Runtime package typecheck tasks run `tsc --noEmit` and `tsc -p tsconfig.test.json`.
The `config` tool package uses no-emit configuration for both entrypoints and has no build task.
The web application keeps its Start-specific no-emit configuration and generated route checking.

## Migration Guide

The repository already uses these presets. New consuming packages declare both engineering dependencies
when they use `@raypx/config` task helpers:

```json
{
  "devDependencies": {
    "@raypx/tsconfig": "workspace:*",
    "@raypx/config": "workspace:*"
  }
}
```

For older checkouts, move static configuration imports to `@raypx/tsconfig/*.json` and rename
`tsconfig.check.json` to `tsconfig.test.json`. Keep the build and no-emit responsibilities separate,
and retain `@raypx/config` wherever Vite tasks still import its tools.
Install with Bun, then verify the resulting configuration:

```sh
bun install --frozen-lockfile
bun run typecheck
```

作者：Zack <heyloyep@gmail.com>
