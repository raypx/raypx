# @raypx/config

Engineering tools and static TypeScript presets. Runtime application code must
not import this package. Public tools use TypeScript source entrypoints and
need no initial build.

| Export                                  | Purpose                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@raypx/config/vite`                    | Package tasks, transitive cache inputs, source aliases, and Start import protection       |
| `@raypx/config/check-boundaries`        | AST checks for package dependencies, cycles, public exports, and browser/server isolation |
| `@raypx/config/environment`             | Development runtime and package-manager version checks                                    |
| `@raypx/config/tsconfig/*.json`         | Shared base, build, Node, React, and test presets                                         |
| `@raypx/config/tsconfig-presets/*.json` | Compatibility exports pointing to the same presets                                        |

```json
{
  "extends": "@raypx/config/tsconfig/node.json"
}
```

There is no separate active `@raypx/tsconfig` workspace. Style tools copy,
clean, and watch UI CSS. Relative imports in engineering tools retain `.ts`
extensions; internal scripts run with Bun, and Vite+ loads tools through Node's
native type stripping. Source and test types are still checked by tsc.
Runtime packages compile ESM and declarations and use a separate noEmit test
configuration.

`bun run check:boundaries` runs the boundary checker. Package tests cover
boundaries, task configuration, aliases, styles, and development environment
checking. Update allowed dependencies and tests when adding packages or
public exports.

`bun run check:env` reads version declarations and checks actual Node and Bun
versions. It runs without installed dependencies, through root pre hooks and
explicitly before frozen installation in CI. Required versions come from
`.node-version`, `.bun-version`, and consistent root manifest declarations;
failure reports expected and actual tool versions and exits nonzero. The tool
does not download runtimes or implement a universal package-manager validator.

Application variable parsing belongs to `@raypx/env/server`.
`bun run check:runtime-env` validates those application values without starting
the service; it is separate from development tool checks.
