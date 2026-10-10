# Continuous integration

The `CI` workflow runs two independent jobs on pushes and pull requests:

- `quality` runs `bun run verify` once, including read-only repository policy,
  package and application builds,
  Storybook's static build, formatting, lint, boundaries, unused-code checks,
  types, tests, and independent package consumers.
- `browsers` builds its own prerequisites and runs Storybook interactions and
  accessibility, application development/production E2E, and the independent UI
  consumer. These suites keep their own server and fixture cleanup. If one suite
  fails, the remaining suites still run when build and Chromium setup succeeded;
  their failures continue to fail the job.

The final job keeps the original `check` status name for branch protection. It
runs after both jobs and accepts only two `success` results. A failed, cancelled,
or skipped prerequisite cannot produce a successful gate. Branch protection is
configured in GitHub and should continue requiring this final `check` status.
Concurrency cancels superseded workflow runs; it does not convert cancellation
into success.

## Shared setup and caches

`actions/setup` reads `.node-version` and `.bun-version`, validates the development
toolchain, and installs dependencies with `bun install --frozen-lockfile` on every
run. Its cache contains Bun's download store, not `node_modules`. The key includes
runner OS/architecture, installed Bun version, and the lockfile hash; compatible
older download caches can supply unchanged packages after a lockfile update.
Neither a cache hit nor a restored fallback skips installation or lifecycle steps.

`actions/chromium` resolves the installed, locked Playwright package and its own
`playwright-core` dependency, which also works with Bun's isolated linker. The
binary cache key includes runner OS/architecture, Playwright version, Chromium
revision, and a hash of the complete browser metadata. It has no broad fallback.
The action always installs Linux system dependencies and asks Playwright to ensure
the matching Chromium binaries exist, including on cache hits. A shared
`PLAYWRIGHT_BROWSERS_PATH` applies to all browser suites in the job.

These workflows use read-only repository permissions and require no application
or cloud credentials. Local composite actions are repository tooling and do not
participate in application bootstrap or runtime imports.

## Failure evidence and local validation

Quality failures retain command output in `quality-reports`. Browser failures
retain build/suite output plus available Playwright HTML reports, screenshots,
and traces in `browser-reports`. Artifacts expire after seven days. Uploads are
attempted for failure or cancellation; abrupt runner termination can prevent an
upload. Missing report files never hide the original failing job.

Local validation can check YAML structure, shell syntax, installed browser
metadata resolution, and the final gate's result table. GitHub must confirm
composite-action execution, cache restore/save, Linux system dependency setup,
artifact uploads, and required-status behavior on the first remote run. No local
check substitutes for that acceptance.
