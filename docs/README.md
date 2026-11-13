# Raypx documentation

Raypx is the durable home for persistent Agents: each has one continuing
conversation, memory, routines and a computer. The
[target architecture](architecture/README.md) on this branch is server-owned, with
PostgreSQL as the one authority. Phase 1 makes Agents the signed-in Web/Desktop
home, with Space selection, Agent management, conversations and process-local
streamed replies. The initial Computer slice adds explicit start/stop for a Space's
team computer and its live state panel. Agent tools, approvals and durable recovery
arrive later. The earlier CLI/daemon,
native host and device stores remain; the development guides below describe that
retained code until its [roadmap](roadmap.md) phase replaces it.

Start with the [architecture](architecture/README.md), the [roadmap](roadmap.md)
and [development setup](development/getting-started.md).
[Root instructions](../AGENTS.md) define repository rules. Workspace manifests are the inventory:
`bun run workspace:list` and `bun run test list`.

## Architecture and decisions

- [Overview, topology, workspaces and decision history](architecture/README.md)
- [Domain model and data](architecture/domain.md)
- [Run execution and recovery](architecture/execution.md)
- [Conversations and the event stream](architecture/events.md)
- [Approvals and effects](architecture/approvals.md)
- [Computers, the supervisor and device connectors](architecture/computers.md)
- [Spaces, membership and settings](architecture/spaces.md)
- [Routines, memory, pages and connections](architecture/capabilities.md)
- [Clients](architecture/clients.md)
- [Security boundaries](architecture/security.md)
- [Deployment and operations](architecture/operations.md)
- [Server-owned Agent platform decision](architecture/0066-server-owned-agent-platform.md)
- [Roadmap and acceptance](roadmap.md)

## Development and verification

- [Environment and everyday commands](development/getting-started.md)
- [Workspace boundaries and package creation](development/workspaces.md)
- [Tests, ownership and release gates](development/testing.md)
- [Validation automation, CI, caches and evidence](development/validation-artifacts.md)
- [Dev CLI commands and checks](development/dev-cli.md)
- [Agent quality Evals and performance checks](development/agent-quality.md)
- [Development DevTools and diagnostic snapshots](development/devtools.md)
- [Frontend components and source adaptation](development/ui.md)

## Applications and local execution

- [MyGo Desktop configuration, native transport and release](development/desktop.md)
- [Standalone CLI commands and profiles](../apps/cli/README.md)
- [Independent terminal host and connectors](development/terminal-host.md)
- [Expo mobile development and login](development/mobile.md)
- [Pi AI model calls](development/ai.md)
- [Memory, templates and task context](development/task-context.md)
- [Local SQLite schema and migrations](development/local-sqlite.md)

## Accounts and shared services

- [Accounts, sessions, roles, administration and OAuth](development/accounts.md)
- [HTTP API and OpenAPI](development/openapi.md)
- [Administrator configuration](development/configuration.md)
- [Server caching](development/caching.md)
- [Object storage](development/object-storage.md)
- [Server jobs and expired-record cleanup](development/server-jobs.md)
- [Internationalization and device preferences](architecture/internationalization.md)
- [Shared Hugeicons package](development/icons.md)
- [Opt-in browser analytics](architecture/analytics.md)
- [Shared logger](../packages/logger/README.md)
- [Raypx Kit library changes](development/kit-library-release.md)
- [In-repository i18n migration record](development/i18n-intl-vendoring.md)

## Deployment

- [Compose deployment, production and Beta environments](development/deployment.md)
- [Railway deployment and domains](development/railway.md)
- [Infrastructure workspaces](../infra/README.md)
- [Cloudflare Relay ingress](../infra/cloudflare/README.md)

## Migration record

- [MyGo / Bun migration, standalone archives and Strobe acceptance](development/mygo-bun-migration-plan.md) — implementation and remaining platform gates

This dated evidence does not replace current platform release gates. Follow the
[Desktop release guide](development/desktop.md#build-and-release) for first
installation, updater keys and macOS/Windows acceptance requirements.
