# @raypx/env

## 0.0.0-alpha.2

### Patch Changes

- 0b904b6: Republish through the CI release pipeline with npm provenance. No functional changes.

## 0.0.0-alpha.1

### Major Changes

- a6af9fe: Raise the minimum supported Node.js version from 22.14.0 to 22.21.0. Update
  package engine declarations and library build targets to the new floor, and
  verify installed consumers on Node 22.21.0. Upgrade older Node installations
  before installing these releases. The repository development pin remains 24.22.0.

## 0.0.0-alpha.0

Initial Raypx Kit prerelease.

- Require Node 22.14+ and align the ESM build target with that runtime floor.

- Refresh compatible dependencies and use caret ranges for ordinary dependencies;
  keep the coverage provider synchronized with Vite+'s bundled Vitest.
- Provide typed `createEnv` and `defineEnv` with nested presets, later schema overrides,
  inferred output types, blank-value normalization, defaults, transforms and error hooks.
- Include the `InferEnv` type helper, guarded browser access and the `/runtime` NODE_ENV preset.
- Keep Zod 4 external as a required peer so consumer schemas share one runtime.
