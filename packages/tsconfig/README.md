# @raypx/tsconfig

Shared TypeScript configurations for the raypx monorepo.

## Available Configurations

### `base.json`
Base TypeScript configuration with strict type checking and modern ES features.

**Features:**
- Strict type checking (`strict`, `strictNullChecks`, `noUncheckedIndexedAccess`)
- ESNext module system with bundler resolution
- Declaration files and source maps enabled
- Full ES2022 + DOM support

**Usage:**
```json
{
  "extends": "@raypx/tsconfig/base.json"
}
```

### `package-library.json`
For non-React internal packages (utilities, tools, etc.).

**Best for:** `@raypx/db`, `@raypx/env`, `@raypx/shared`, `@raypx/validators`, etc.

**Usage:**
```json
{
  "extends": "@raypx/tsconfig/package-library.json"
}
```

### `react-library.json`
For React component libraries and packages.

**Best for:** `@raypx/ui`, `@raypx/auth`, `@raypx/email`, `@raypx/analytics`, etc.

**Features:**
- JSX support with `react-jsx` transform
- Vite client types included (`import.meta.env` support)
- `allowImportingTsExtensions` for importing `.ts`/`.tsx` files
- Declaration files generated for library consumers

**Usage:**
```json
{
  "extends": "@raypx/tsconfig/react-library.json"
}
```

### `vite.json`
For Vite applications (not libraries).

**Best for:** `apps/web`, `apps/docs`, etc.

**Features:**
- React + JSX support
- Vite client types
- `noEmit` enabled (Vite handles compilation)
- `allowImportingTsExtensions` for better DX
- `verbatimModuleSyntax: false` for compatibility

**Usage:**
```json
{
  "extends": "@raypx/tsconfig/vite.json"
}
```

## Quick Reference

| Config | Use Case | JSX | Declaration | Emit | Vite Types |
|--------|----------|-----|-------------|------|------------|
| `base.json` | Base config (extend this) | ❌ | ✅ | ✅ | ❌ |
| `package-library.json` | Non-React packages | ❌ | ✅ | ✅ | ❌ |
| `react-library.json` | React libraries | ✅ | ✅ | ✅ | ✅ |
| `vite.json` | Vite applications | ✅ | ✅ | ❌ | ✅ |

## Compiler Options Highlights

- **`strict: true`** - Maximum type safety
- **`noUncheckedIndexedAccess: true`** - Safer array/object access
- **`moduleResolution: "bundler"`** - Modern bundler-aware resolution
- **`skipLibCheck: true`** - Faster compilation
- **`isolatedModules: true`** - Required for Vite/esbuild
- **`allowSyntheticDefaultImports: true`** - Better CJS interop
- **`allowImportingTsExtensions: true`** - (Vite configs) Import .ts/.tsx files
- **`useDefineForClassFields: true`** - (Vite configs) ES2022 class field behavior

## Decision Tree: Which Config to Use?

```
Is it an application (apps/*)?
├─ Yes → Use vite.json
└─ No → Is it a library (packages/*)?
    ├─ Has React/JSX?
    │   └─ Yes → Use react-library.json (includes Vite support)
    └─ No React
        └─ Use package-library.json
```

**Note:** Since this project only has Vite-based applications, all React libraries automatically support Vite features like `import.meta.env`.

## Common Patterns

### Package with custom options
```json
{
  "extends": "@raypx/tsconfig/package-library.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Vite app with custom include
```json
{
  "extends": "@raypx/tsconfig/vite.json",
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```
