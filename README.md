# Voidmix

[![CI](https://github.com/voidmix/voidmix/actions/workflows/ci.yml/badge.svg)](https://github.com/voidmix/voidmix/actions/workflows/ci.yml)
[![Bun 1.4.0](https://img.shields.io/badge/Bun-1.4.0-fbf0df?logo=bun&logoColor=000)](https://bun.sh/)
[![Node.js 24.18.0](https://img.shields.io/badge/Node.js-24.18.0-339933?logo=nodedotjs&logoColor=fff)](https://nodejs.org/)
[![TypeScript 7.0.2](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-d22128?logo=apache&logoColor=fff)](./LICENSE)

Voidmix is a Bun-managed, Turbo orchestrated TypeScript monorepo for a cloud
web app with a standalone typed Hono API, an operations console, and a Tauri
desktop client.

Dependency versions are centralized with Bun Catalogs in the root
`package.json`: the default catalog covers shared runtime and contract
dependencies, while named `tooling`, `backend`, and `frontend` catalogs keep
their respective stacks in lockstep.

See the [documentation index](./docs/README.md) and
[architecture overview](./docs/architecture/README.md) for workspace
boundaries, data flow, dependency direction, and runtime/deployment decisions.

Repository instructions for coding agents live in [AGENTS.md](./AGENTS.md), with
a per-workspace `AGENTS.md` in each app and package. Claude Code loads the same
rules through [CLAUDE.md](./CLAUDE.md), so Codex and Claude share one source of
truth. See [CONTRIBUTING.md](./CONTRIBUTING.md) for what must pass before a pull
request.

## Workspace map

```text
apps/web        TanStack Start user application
apps/desktop    Tauri 2 desktop client
apps/api        Standalone Nitro API application
apps/worker     Cloud Pi execution, trusted tools and durable outbox host
apps/storybook  Storybook UI component workbench
e2e             Playwright Web smoke tests, including protected Admin routes

packages/ui         Shared visual primitives
packages/agent-ui   Shared controlled Agent business components
packages/storage    Private S3-compatible object storage adapter
packages/application Shared cloud and Project use cases for API and Worker
packages/ai         Server-side Pi Agent adapter
packages/cache      Redis cache facade and Better Auth secondary storage
packages/client     Typed oRPC client
packages/contracts  Runtime API contracts
packages/core       Framework-independent business rules
packages/auth       Sessions, roles, and permissions
packages/i18n       use-intl facade, locale adapters, and formatting
packages/mail       Typed auth email templates and transports
packages/db         Drizzle schema and repository adapters
packages/shared     Foundation errors, environment presets, and logger adapters
packages/scripts    Repository automation CLI
packages/tsconfig   Shared TypeScript presets
```

`bun run policy` keeps this listing and the one in `AGENTS.md` in step with the
workspaces Bun actually resolves, in both directions. The Worker owns durable
outbox delivery, cloud Pi execution and trusted document generation. The Web-first
release uses a fresh database and private object storage. Desktop cloud integration
and local execution follow [the cloud platform decision](./docs/architecture/decisions/0016-cloud-agent-platform.md).

## Requirements

- Bun 1.4.0
- Node.js 24.18.0
- Rust/Cargo for desktop builds
- PostgreSQL for persistent API data

## Getting started

```bash
cp .env.example .env
bun install
bun run generate
bun run db:migrate
bun run dev
```

Use the root `.env.local` for machine-specific overrides. Env-sensitive
workspace scripts run through `vmx env -- <command>`, which loads root
`.env.local` and then root `.env` without overriding values already present in
the shell. Unit tests do not use this runner and must provide their environment
explicitly.

The API and Worker require `DATABASE_URL` at startup; Web only needs the API
origin (`VITE_API_URL`). Use the local PostgreSQL service from the commands
below, or point it at another PostgreSQL instance. Admin authentication uses
Better Auth cookies; local auth mail is logged when Resend is not configured.

## Common commands

```bash
bun run doctor
bun run clean
bun run check
bun run test
bun run test:e2e
bun run build
bun run db:migrate
bun run db:push
bun run db:clean
bun run db:seed
bun run db:studio
bun run admin:create -- --email owner@example.com --name "Workspace Owner"
bun run desktop:build
bun run storybook
bun run storybook:build
bun run verify
```

The direct repository CLI uses nested commands such as `vmx db migrate`,
while the root Bun script names above remain stable aliases.

Turbo owns task orchestration and caching; Vite+ owns leaf tools. `@voidmix/scripts` is reserved for procedural
automation such as database setup, generated artifacts, and desktop packaging.
Using the Bun scripts also guarantees that the repository-local Vite+ version
is used even when a different global `vp` is installed.

The root `.env.example` is the only committed environment example. Production
services read platform-provided `process.env`; the private repository CLI is
not part of production startup.

## Local PostgreSQL

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:seed
bun run db:studio
```

The integrated `/admin` surface calls the standalone API origin through oRPC.
Unavailable API states are surfaced in the Web UI.
