# Raypx

Raypx is the home for persistent Agents, each with one continuing conversation.
People share Spaces to work with the same Agents. PostgreSQL owns conversations,
Runs and permissions; Web, Desktop and Mobile render server state.

The implemented platform includes paged conversation history, streamed replies,
durable Runs with recovery and stop, Computer tools, approvals and effects,
routines, Agent and Space memory, versioned Pages, text skills, remote HTTP MCP
servers, Space-owned OpenAPI tools and member-owned model connections. Shared
Spaces support invitations, membership management, group conversations and bounded
delegation. Active Runs
outside loaded history stay reachable through Still working on all three clients.
Space owners manage HTTP APIs in Web/Desktop; Mobile shows activity and approvals.
See the [product overview](PRODUCT.md) for client coverage and limits, and the
[architecture](docs/architecture/README.md) and [roadmap](docs/roadmap.md) for
technical decisions and separate acceptance gates.

The Agent runtime and credentials stay outside the computer. A private sandbox
supervisor alone holds the Docker socket. Without a configured provider,
computer-dependent actions report unavailable; the rest of the workspace starts.
The retained CLI/daemon, SQLite profiles and native enrollment are separate from
server conversations, pending their replacement phase. They are not an offline
mode for the Agent platform, and no old profile data is imported.

## Start locally

Use Bun 1.4.4, pinned in `package.json`, and an isolated PostgreSQL 17 database.
Desktop additionally uses Go 1.27.3 and MyGo 0.8.3 with `CGO_ENABLED=0`.

```sh
bun install
cp .env.example .env
# Development database on 5433, in the separate foundation volume.
docker compose up -d postgres
bun run db:migrate
bun dev
```

Web runs on 3000 and the backend on 3002. The default `SERVER_ROLE=all` runs API,
recovery worker and retained Relay together. Durable Run coordination uses
PostgreSQL; Redis is optional unless splitting the retained device transport.
Configure a deployment model catalog or add a model connection in account settings.
An empty catalog is an explicit unavailable state.

Follow [local setup](docs/development/getting-started.md) for environment variables,
mail, separate roles and Desktop/Mobile connections. Follow the
[sandbox guide](docs/development/sandbox.md) to enable computers with Docker or
Colima, including the separate egress gate. Never reuse a retired/operator database
for development or tests.

## Daily commands

| Task                              | Command                                |
| --------------------------------- | -------------------------------------- |
| Start Web and backend             | `bun dev`                              |
| Start Desktop                     | `bun dev:desktop`                      |
| Start Mobile                      | `bun dev:mobile`                       |
| List workspace suites             | `bun run test list`                    |
| Test the Agent feature            | `bun run test --package @raypx/agents` |
| Browser acceptance                | `bun e2e`                              |
| Verify affected sources           | `bun run verify`                       |
| Apply formatting                  | `bun format --write`                   |
| Check repository policy and links | `bun run policy`                       |
| Build                             | `bun run build`                        |

Turbo schedules manifest-owned tasks. `raypx-dev` is the engineering CLI;
`raypx` is the retained device executable. `verify --full` adds repository audits,
builds and current-platform artifact probes. PostgreSQL, owned-backend browser
journeys, real Docker, live models and packaged native acceptance remain explicit
gates. Source or browser success establishes no unrun platform result.

Start with the [documentation index](docs/README.md),
[testing guide](docs/development/testing.md), and [contribution rules](CONTRIBUTING.md).
