# @raypx/tsconfig

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

- Declare Node 22.14+ support consistently with the other public packages.

- Refresh compatible dependencies and use caret ranges for ordinary dependencies;
  keep the coverage provider synchronized with Vite+'s bundled Vitest.
- Publish the strict `base`, `node`, `browser`, `library` and `react-library` presets
  with shared strict compiler defaults.
- Keep explicit JSON exports and sibling preset references; consumers own project layout,
  path aliases, project references and runtime-specific ambient types.
