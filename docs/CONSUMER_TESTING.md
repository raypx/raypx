# Application and independent consumer acceptance

`bun run test:e2e` builds the application and runs seven Chromium scenarios in
development and production, sequentially. The server fixtures choose their own
loopback ports, receive synthetic configuration with authentication and metrics
disabled, and stop their own process groups on success or failure. Development
uses Vite's `e2e` mode with environment-file loading disabled; production runs
Bun with `--no-env-file`. Existing account/API production tests retain account
coverage without adding account pages.

The browser scenarios cover hydration and health, navigation/history, persistent
light/dark/system themes, form submission/toasts, dialog portals and focus,
health failure/retry, and page 404 recovery. They use accessible roles and labels.
They do not manufacture a production throw route to test the root React boundary.
The application and consumer suites retain failure traces/screenshots in
`test-results`, with HTML reports in `playwright-report`.

`bun run check:consumer` builds shared packages and validates their public
artifacts in temporary installations outside this repository. The core consumer
has no React or React Query, the server consumer exercises Node and Bun database
drivers/migrations plus auth and memory caching, and the browser consumer builds
React providers, UI components/hooks, and Tailwind-compiled theme CSS. Every
runtime import resolves inside the fixture. Both NodeNext and Bundler consumers
compile public declarations with strict checking and the template's existing
`skipLibCheck` setting. Representative HTTP calls, provider/UI JSX and debounce
inference include negative type cases, so accidental `any` cannot silently make
invalid request bodies or component variants acceptable. Configuration tools are source exports and are checked
as tooling assets, rather than mislabeled as runtime dist entrypoints.

The harness copies dist and declared tooling assets, including UI's source-only
shadcn destinations and DB migration files. It keeps package exports and peer
metadata, rewrites workspace references only in fixture manifests, and pins
third-party direct dependencies to the actual versions in `bun.lock`. The current
registry lock graph seeds offline fixture normalization; any new version,
changed integrity, or changed transitive edge rejects the fixture before a
frozen install. No source aliases, repository node_modules links, real env files,
or registry publication are used.

The core also bundles its browser entries with an inspected module graph that
rejects React, React Query, server modules and repository paths. Lock regression
tests reject changed versions, integrity and resolved transitive edges; a process
cleanup regression verifies that timeouts kill descendants holding output pipes.

Only the core fixture omits peer auto-installation and verifies React remains
unavailable. Server and browser consumers retain normal peer installation; React
peers are explicit locked dependencies. The server fixture explicitly
trusts only `better-sqlite3` and uses its real install lifecycle. Node 22.22.1 must
be available on PATH; native prebuild fallback requires the normal node-gyp tools.
The fixture has no project prepare hooks. Temporary files are removed in finally
blocks, including after failure.

`bun run test:consumer:browser` independently builds a small consumer and runs a
Chromium interaction against the installed packages and compiled CSS. It is
separate from application E2E and Storybook: Storybook checks source component
behavior, while this check detects broken built exports, duplicate providers,
missing CSS content discovery, and browser/server boundary leaks.

CI installs the same pinned Chromium once, then runs Storybook, application E2E,
and consumer browser checks. Local browser tests are explicit commands;
`check:consumer` requires no installed browser. Consumer harness source is checked
with `tsc -p scripts/consumer/tsconfig.json`.
