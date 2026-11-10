# Raypx

A project-centered personal development workbench. MyGo Desktop and the standalone
CLI execute on your computer; Web provides optional remote access. Projects, Agent
sessions, approvals, files, automations and terminals share explicit device ownership.
The [current architecture](docs/architecture/README.md) defines the implementation.

## Requirements

Bun 1.4.4 and an isolated PostgreSQL database for account flows. Bun is the only
JavaScript runtime; `packageManager` pins it. With [mise](https://mise.jdx.dev),
run `mise trust && mise install` once; direct installs also work.
`bun run doctor` confirms it.
Native Desktop development and packaging require Go 1.27.3 and MyGo 0.8.3, with
`CGO_ENABLED=0`. The configured macOS minimum is 13.5; Windows uses WebView2.
Linux CLI support does not establish Linux Desktop acceptance. See the
[MyGo Desktop guide](docs/development/desktop.md#build-and-release).
Desktop bundles the same compiled Bun CLI/daemon with its MyGo host; users do not
install Bun.

```sh
bun install
cp .env.example .env
# Starts a NEW database on 5433; does not reuse the old volume.
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Web (TanStack Start SSR) runs on 3000; the combined API/Relay backend runs on 3002.
They deploy as separate Bun services: `bun apps/web/.output/server/index.mjs` and
`bun apps/api/.output/server/index.mjs`. Web bakes `VITE_API_URL` at build time.
The backend defaults to `SERVER_ROLE=both` without Redis. Split `api` and `relay`
roles use the same output with a private Redis broker.
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
