# Raypx documentation

Raypx is the home for persistent Agents and continuing conversations. PostgreSQL
owns Spaces, Runs and capabilities; clients render that state. Start with
[local setup](development/getting-started.md), the
[product overview](../PRODUCT.md), [architecture](architecture/README.md) and
[roadmap](roadmap.md). Code determines implemented coverage; architecture targets
and authored acceptance cases do not establish a passed platform gate.
[Root instructions](../AGENTS.md) define repository rules. Discover workspaces and
suites with `bun run workspace:list` and `bun run test list`.

Active Runs outside loaded history remain reachable through Still working on
Web, Desktop and Mobile. Space owners register bounded OpenAPI tools alongside
remote MCP servers in Web/Desktop; all three clients show activity and addressed
approvals. See [capabilities](architecture/capabilities.md) and
[UI workflows](development/ui.md).
Web/Desktop also provide optional computer Screen viewing and takeover; native
Mobile uses the phone Web client for Screen. See [clients](architecture/clients.md).

## Architecture and decisions

- [Overview and decision history](architecture/README.md)
- [Domain and data](architecture/domain.md)
- [Run execution and recovery](architecture/execution.md)
- [Conversations and events](architecture/events.md)
- [Approvals and effects](architecture/approvals.md)
- [Computers and security](architecture/computers.md)
- [Spaces and membership](architecture/spaces.md)
- [Routines, memory, Pages and connections](architecture/capabilities.md)
- [Clients](architecture/clients.md)
- [Security boundaries](architecture/security.md)
- [Deployment and operations](architecture/operations.md)
- [Server-owned platform decision](architecture/0066-server-owned-agent-platform.md)

## Development and acceptance

- [Local PostgreSQL, API, Web, Desktop and Mobile setup](development/getting-started.md)
- [Docker/Colima supervisor and egress setup](development/sandbox.md)
- [Source suites and separate acceptance gates](development/testing.md)
- [Validation automation, CI, caches and evidence](development/validation-artifacts.md)
- [Dev CLI reference](development/dev-cli.md)
- [Workspace boundaries](development/workspaces.md)
- [Desktop configuration and native release](development/desktop.md)
- [Mobile workflows and device acceptance](development/mobile.md)
- [AI adapters and backend model configuration](development/ai.md)
- [Space memory and retained task context](development/task-context.md)
- [Server routines and maintenance](development/server-jobs.md)
- [Development diagnostics](development/devtools.md)
- [UI components](development/ui.md)

## Accounts and shared services

- [Accounts, sessions and deployment roles](development/accounts.md)
- [HTTP API and OpenAPI](development/openapi.md)
- [Administrator configuration](development/configuration.md)
- [Caching](development/caching.md)
- [Object storage for retained session attachments](development/object-storage.md)
- [Internationalization](architecture/internationalization.md)
- [Chinese i18n migration record and current boundaries](development/i18n-intl-vendoring.md)
- [Icons](development/icons.md)
- [Opt-in analytics](architecture/analytics.md)
- [Logger](../packages/logger/README.md)
- [External library changes](development/kit-library-release.md)

## Deployment

- [Compose environments](development/deployment.md)
- [Railway](development/railway.md)
- [Infrastructure workspaces](../infra/README.md)
- [Optional retained Relay ingress](../infra/cloudflare/README.md)

## Retained device runtime

These guides cover still-present CLI/daemon, profile, native and remote-projection
consumers until their replacement phase. They are not the server Agent workflow
or a second authority for Spaces; no device-history import is provided.

- [Standalone device CLI](../apps/cli/README.md)
- [Terminal host and external-provider hooks](development/terminal-host.md)
- [Local SQLite profiles](development/local-sqlite.md)
- [Retained harness quality and performance gates](development/agent-quality.md)
- [Prepared CLI payloads and distribution acceptance](development/mygo-bun-migration-plan.md)

Source, PostgreSQL, listener/browser, live Engine, live-model and packaged native
results are independent. Unverified platforms stay unverified.
