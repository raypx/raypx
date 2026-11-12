# @raypx/tsconfig

Strict TypeScript presets for ESM libraries, browser applications and
Node-compatible runtimes. Each preset sets compiler behavior only; projects own
their file layout, path aliases and runtime-specific types. The private
`@raypx/tsconfig` workspace exports the presets as plain JSON files.

```sh
# Internal raypx workspaces use @raypx/tsconfig/*.json directly.
```

## Presets

| Preset                             | Extends | Adds                                                              |
| ---------------------------------- | ------- | ----------------------------------------------------------------- |
| @raypx/tsconfig/base.json          | —       | strict compiler defaults, noEmit, ES2022 target, no ambient types |
| @raypx/tsconfig/node.json          | base    | NodeNext modules and resolution, ES2022 libraries, @types/node    |
| @raypx/tsconfig/node-bundler.json  | node    | Node types with ESNext modules and bundler resolution             |
| @raypx/tsconfig/browser.json       | base    | Bundler resolution, DOM libraries, react-jsx                      |
| @raypx/tsconfig/library.json       | base    | Bundler resolution, ES2022 libraries                              |
| @raypx/tsconfig/react-library.json | library | DOM libraries and react-jsx                                       |

```json
{
  "extends": "@raypx/tsconfig/node.json",
  "include": ["src/**/*.ts"]
}
```

`node.json` describes Node-compatible module resolution and standard API types.
It works for Bun and Deno projects too, but does not include their own type
packages; add `"types": ["node", "bun"]` or similar in the consuming project.
Install `@types/node` alongside it. The other presets declare no ambient types.

## Compiler guarantees

Every preset inherits these options from `base.json`:

| Option                           | Value | Consequence for source code                                     |
| -------------------------------- | ----- | --------------------------------------------------------------- |
| strict                           | true  | all strict type-checking families                               |
| noUncheckedIndexedAccess         | true  | indexed reads include undefined                                 |
| exactOptionalPropertyTypes       | true  | omit optional keys instead of assigning undefined               |
| verbatimModuleSyntax             | true  | type-only imports use import type                               |
| isolatedModules                  | true  | each file can be transpiled independently                       |
| noImplicitOverride               | true  | overriding members declare override                             |
| useUnknownInCatchVariables       | true  | catch variables are unknown                                     |
| noFallthroughCasesInSwitch       | true  | non-empty switch cases end explicitly                           |
| noUnusedLocals                   | true  | unused declarations are errors                                  |
| noUnusedParameters               | true  | unused parameters are errors unless prefixed with \_            |
| noUncheckedSideEffectImports     | true  | side-effect imports must resolve                                |
| forceConsistentCasingInFileNames | true  | import casing matches the file system                           |
| resolveJsonModule                | true  | infer keys for imported JSON objects                            |
| noEmit                           | true  | type-checking only; bundlers and declaration builders emit code |
| skipLibCheck                     | true  | third-party declarations are not re-checked                     |

With `exactOptionalPropertyTypes`, use conditional spread for optional values:

```ts
const options = { limit, ...(query ? { query } : {}) };
```

Relative imports and re-exports use `.js` specifiers, including dynamic imports
and type-only imports. TypeScript, Bun and the application bundlers resolve them
to the `.ts`/`.tsx` source files; Mobile's Metro config applies the same convention.
Source filenames, package export targets and filesystem paths keep their actual
extensions. The presets leave `allowImportingTsExtensions` disabled so type checks
reject `.ts`/`.tsx` module specifiers. JSON imports keep `.json` and use standard
`with { type: "json" }` attributes. JSON object keys remain typed, but string values
widen rather than preserving TS `as const` literal types.

## Consumer-owned settings

Presets never set `include`, `exclude`, `files`, `references`, `paths`, `baseUrl`,
`rootDir`, `outDir` or `declarationDir`. Keep runtime-specific ambient types,
such as Bun or Vite client types, in the project that uses them. Override any
compiler option locally when a project needs different behavior.

## Compatibility

The repository development catalog selects TypeScript 7.0.2; current checks use
that toolchain. Presets resolve through package `exports`, so
consumers extend the exact exported file names shown above.

Changes to strictness or module resolution require checking all workspace
consumers together. This private workspace has no independent release workflow.

## License

Apache-2.0
