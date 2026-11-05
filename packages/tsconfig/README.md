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
| @raypx/tsconfig/browser.json       | base    | Bundler resolution, DOM libraries, react-jsx, .ts import paths    |
| @raypx/tsconfig/library.json       | base    | Bundler resolution, ES2022 libraries, .ts import paths            |
| @raypx/tsconfig/react-library.json | library | DOM libraries and react-jsx                                       |

```json
{
  "extends": "@raypx/tsconfig/node.json",
  "include": ["src/**/*.ts"]
}
```

`node.json` describes Node-compatible module resolution and standard API types.
Runtime-specific types belong in consuming projects; Node consumers declare
`"types": ["node"]`.
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
| noEmit                           | true  | type-checking only; bundlers and declaration builders emit code |
| skipLibCheck                     | true  | third-party declarations are not re-checked                     |

With `exactOptionalPropertyTypes`, use conditional spread for optional values:

```ts
const options = { limit, ...(query ? { query } : {}) };
```

`browser.json` and `library.json` enable `allowImportingTsExtensions`, which
TypeScript accepts only without JavaScript emit. A project that emits with `tsc`
must override `noEmit` and remove `.ts` import extensions, or emit declarations
only.

## Consumer-owned settings

Presets never set `include`, `exclude`, `files`, `references`, `paths`, `baseUrl`,
`rootDir`, `outDir` or `declarationDir`. Keep runtime-specific ambient types,
such as Node or Vite client types, in the project that uses them. Override any
compiler option locally when a project needs different behavior.

## Compatibility

The repository development catalog selects TypeScript 7.0.2; current checks use
that toolchain. Presets resolve through package `exports`, so
consumers extend the exact exported file names shown above.

Changes to strictness or module resolution require checking all workspace
consumers together. This private workspace has no independent release workflow.

## License

Apache-2.0
