# Raypx

A project-centered personal development workbench. Tauri Desktop and the standalone
CLI execute on your computer; Web provides optional remote access. Projects, Agent
sessions, approvals, files, automations and terminals share explicit device ownership.
The [current architecture](docs/architecture/README.md) defines the implementation.

## Requirements

Bun 1.4.4 and an isolated PostgreSQL database for account flows. Root
`packageManager` pins Bun; `bun run doctor` checks the active runtime. Native
Desktop development requires Rust 1.99.1 and Tauri 2.12.5. macOS requires 13.5+;
Windows uses WebView2. Linux Desktop acceptance remains unverified. Installed
Desktop and CLI payloads include the Bun runtime. This branch evaluates
[Bun + Tauri](docs/development/bun-tauri-experiment.md) from `origin/dev`.

```sh
bun install
cp .env.example .env
# Starts a NEW database on 5433; does not reuse the old volume.
docker compose up -d postgres valkey
bun run db:migrate
bun run dev
```

Web (TanStack Start SSR) runs on 3000, API on 3002 and independent Relay on 3003.
They deploy as separate
Bun services: `bun apps/web/.output/server/index.mjs` and
`bun apps/api/.output/server/index.mjs`. Web bakes `VITE_API_URL` at build time.
Relay starts with `bun infra/relay/dist/main.js`; the gateway sends `/relay` to it.
Its server rendering needs the session cookie: serve both from one origin, or set
`AUTH_DOMAIN` to the parent domain of sibling hosts such as app/api.example.com.
Register each local Desktop/CLI profile once to an account and API origin. Its signed
identity then permits offline local work, including after online logout. Remote
data and Host authorization require a separate online session and explicit grants.
On macOS and Windows, the independent CLI daemon owns scheduling and execution;
closing or quitting Desktop leaves daemon tasks running.
External tools run with the user's OS permissions.

## Commands

```sh
bun run workspace:list
bun run workspace:new example --target universal         # preview
bun run workspace:new example --target universal --write # create
bun run check
bun run test
bun run test unit
bun run test --package tasks
bun run --cwd packages/tasks test
bun run build
bun run verify
bun run verify --full
bun run package:desktop
```

VP discovers tasks from workspace manifests. Engineering commands are exposed
as `raypx-dev`; the product executable is `raypx`. Workspace discovery reads the
root `package.json` patterns, including applications, libraries, infrastructure and E2E.
`verify` checks affected sources/tests; `verify --full` adds repository-wide audits,
builds and current-platform artifact probes. Database, browser and packaged GUI
acceptance have separate gates. The Expo Mobile workspace currently provides an
account/login baseline; it is not the complete Desktop workbench.
Use `bun run test --help` or the [test command guide](docs/development/testing.md#test-commands)
for root suites, package-local commands and optional backend/browser gates.

See [documentation](docs/README.md), [architecture](docs/architecture/README.md),
[infrastructure](infra/README.md),
[workspace extension](docs/development/workspaces.md) and [verification](docs/development/testing.md).
