# Dependency maintenance

`bun.lock` is the reproducible installation baseline. Shared runtime and toolchain
versions live in the root `workspaces.catalog`; workspace manifests use `catalog:`.
Some application dependencies retain semver ranges, so keep the lockfile in every
upgrade and use `bun install --frozen-lockfile` in CI.

## Local workflow

```sh
# Read registry availability for the root and every workspace; does not write files.
bun run deps:outdated
# Optionally restrict the report to a dependency family.
bun run deps:outdated 'playwright*'

# Upgrade a direct (non-catalog) declaration, after reviewing release notes.
bun run deps:update 'citty@0.2.2'
# Preview the same operation without writing files.
bun run deps:update --dry-run 'citty@0.2.2'

# Validate related versions against the installed toolchain.
bun run deps:check
# Equivalent repository CLI command; works from any cwd with the absolute bin path.
bun raypx deps

bun install --frozen-lockfile
bun run check
bun run storybook:test
bun run test:e2e
bun run test:consumer:browser
```

The version above illustrates explicit selection, not a recommendation to downgrade
or a promise that it is the newest release. `deps:update` delegates to
`bun update --recursive`: with no package arguments it updates within existing
ranges; exact pins stay pinned. `--latest` ignores those ranges, so select packages
explicitly when crossing a pin or major version. For catalog dependencies, edit the version in root `workspaces.catalog`, then run
`bun install` to update `bun.lock`. Keep workspace `catalog:` declarations intact.
With the pinned Bun 1.4.2, an explicit `bun update package@version` may leave an
exact catalog pin unchanged; do not treat a zero exit code as proof it upgraded.
Review every manifest and lockfile change before merging.
There is no Taze dependency or `update:minor`/`update:patch` wrapper.

## Related upgrades

| Group          | Update together                                                                                                                | Acceptance                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Vite+ / Vitest | Catalog `vite-plus`, aliased `vite`, root `overrides["vite@*"]`, `vitest`, `@vitest/coverage-v8`, `@vitest/browser-playwright` | `deps:check`, full check, Storybook and browser suites, coverage smoke       |
| Storybook      | `storybook` and all `@storybook/*` packages in UI                                                                              | Same exact release, static build and browser stories                         |
| Playwright     | Catalog `playwright`; root, web, and UI consume the same entry                                                                 | Install Chromium for the new release, run all browser suites                 |
| Bun / Node     | Version files, `packageManager`, `devEngines`, `engines`, related type packages, CI and documentation                          | `check:env` before installation, frozen installation and complete acceptance |

Vite+ owns the test runner version. Read its installed `package.json` or release
metadata to select the matching Vitest plugins; the newest standalone Vitest
release may not match. Keep the Vite alias and override on the core version declared by that
Vite+ release. `deps:check` rejects drift and stale installations and runs inside
`bun run check`. It reads local manifests only and never installs or updates anything.
Grouping an upgrade PR does not establish compatibility: failed checks must be
resolved before merge. Tests include intentionally mismatched versions.

## Renovate

The repository includes `renovate.json` with weekly Bun and GitHub Actions updates,
separate groups for the three tool families, and lockfile maintenance. Automerge is
disabled. Runtime pins are manual because multiple declarations must move together.
The [Bun manager](https://docs.renovatebot.com/modules/manager/bun/) owns package
ordinary manifests and `bun.lock`. Two scoped custom regex managers extract the
root catalog and npm aliases (including the wildcard Vite override), which the
validated Renovate version does not extract natively. All extracted versions
join the same package groups. Recheck these managers when upgrading Renovate to
avoid duplicate extraction if native support is added. Do not configure a second
npm lockfile workflow.

To activate automated PRs, a repository administrator must enable the Renovate
GitHub App for their fork (or configure their own Renovate runner). This repository
configuration does not install an app, grant permissions, or establish a running
schedule by itself. The local commands above remain usable without an account.
Require the final CI `check` status; it includes quality and browser jobs.

Validate configuration changes with the official validator using Node.js 24.10+
in an isolated tools directory. The validator has its own runtime requirement;
repository work continues to use the pinned Node.js 22 toolchain:

```sh
# Run outside this checkout; use an absolute path to its renovate.json.
npx --yes --package renovate@44.149.1 -- renovate-config-validator \
  --strict --no-global /absolute/path/to/raypx/renovate.json
```

See [Renovate validation](https://docs.renovatebot.com/config-validation/),
[Bun update](https://bun.com/docs/pm/cli/update), and [testing](../TESTING.md).
