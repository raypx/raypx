# Raypx documentation

Raypx is a project-centered workbench with MyGo Desktop, a standalone TypeScript
CLI/daemon, TanStack Start Web, Bun backend with API/Relay roles. Desktop targets
macOS 13.5+ and Windows; Expo Mobile currently provides the account/login baseline.
Register local profiles once for offline work; remote data and execution grants
require separate online authorization.

Start with the [project overview](../README.md), [product scope](../PRODUCT.md),
[current architecture](architecture/README.md) and
[development setup](development/getting-started.md).
[Root instructions](../AGENTS.md) define repository rules. Workspace manifests are the inventory:
`bun run workspace:list` and `bun run test list`. Current guides describe the
implementation; the roadmap describes future work. Decision records explain the
boundaries behind the implementation.

## Architecture and decisions

- [Current stack, process ownership, data boundaries and distribution](architecture/README.md)
- [Accepted Bun CLI production packaging](architecture/0047-bun-cli-production-packaging.md)
- [MyGo / Bun and immutable CLI artifacts](architecture/0046-mygo-bun-artifacts.md)
- [Remote Agent tasks and approvals](architecture/remote-tasks.md)
- [Decision history and supersession status](architecture/README.md#decision-history)
- [Pi product roadmap](roadmap.md)

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
- [Backend runtime roles](architecture/0051-backend-runtime-roles.md)
- [Cloudflare Relay ingress](../infra/cloudflare/README.md)

## Migration record

- [MyGo / Bun migration, standalone archives and Strobe acceptance](development/mygo-bun-migration-plan.md) — implementation and remaining platform gates

This dated evidence does not replace current platform release gates. Follow the
[Desktop release guide](development/desktop.md#build-and-release) for first
installation, updater keys and macOS/Windows acceptance requirements.
