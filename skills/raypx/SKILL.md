---
name: raypx
description: Working knowledge for the Raypx monorepo — a multi-platform account foundation (TanStack Start Web, Hono/oRPC API, Electrobun Desktop, Bun CLI) with device-local Agent tasks. Use for questions or changes about Raypx setup, workspace boundaries, packages, routes, RPC contracts, auth, i18n, analytics, remote tasks, verification, Cloudflare/Node deployment and Raypx Kit libraries.
---

# Raypx

Raypx is a Bun monorepo for one account system across Web, Desktop and a local CLI.
Accounts live in PostgreSQL behind the API; Agent tasks run on the user's own
computer through the CLI, and Web/Desktop can relay to it. Root and workspace
`AGENTS.md` files are the rules; `docs/README.md` indexes the current design.
`docs/history/` describes the retired product and never constrains new work.

## Quick start

```sh
mise trust && mise install            # Bun 1.4.4 (packageManager) + Node 24.15.0 (.nvmrc)
bun install                           # also installs the Vite+ pre-commit hook
cp .env.example .env                  # .env.local wins; shell values win over both
docker compose up -d postgres         # isolated database on port 5433
bun run db:migrate
bun run dev                           # Web on 3000, API on 3002
bun run dev:desktop                   # Desktop renderer on 1420 + native shell
```

Mail, analytics and Cloudflare are optional: missing configuration returns explicit
codes such as `MAIL_NOT_CONFIGURED` or disables the control, never a false success.
Details: [setup](references/setup.md).

## Workspaces

| Workspace            | Kind / target | Purpose                                                               |
| -------------------- | ------------- | --------------------------------------------------------------------- |
| `apps/web`           | app / browser | TanStack Start SSR on Nitro; account, settings, tasks, approvals      |
| `apps/api`           | app / node    | Nitro + Hono: `/api/auth/*` (Better Auth), `/rpc/*` (oRPC), `/health` |
| `apps/desktop`       | app / browser | Electrobun WebView, Start SPA renderer, bundled CLI, tray             |
| `apps/cli`           | app / bun     | Standalone local execution host; works without login                  |
| `packages/contracts` | universal     | oRPC (`/api`) and local device (`/local`) schemas                     |
| `packages/client`    | universal     | Remote API SDK and relay task client                                  |
| `packages/auth`      | universal     | Better Auth server/client/hooks and shared `AuthForm`                 |
| `packages/account`   | universal     | Account projection, read state and DOM views                          |
| `packages/tasks`     | universal     | Shared task/approval views (TanStack Query reads)                     |
| `packages/analytics` | universal     | Opt-in PostHog policies, consent UI, mutation decorators              |
| `packages/i18n`      | universal     | English/Chinese catalogs and locale preferences                       |
| `packages/ui`        | browser       | shadcn/Base UI primitives and neutral theme tokens                    |
| `packages/database`  | node          | Drizzle schema and migrations for the new database                    |
| `packages/mail`      | node          | Auth email templates and Resend delivery                              |
| `packages/storage`   | universal     | Object storage on unstorage: S3/R2/MinIO, pre-signed URLs             |
| `packages/tooling`   | tooling / bun | `raypx-dev` CLI: policy, tasks, verify, smoke, db                     |
| `e2e`                | tooling / bun | Chromium acceptance of Web and Desktop renderer                       |

`@raypx-kit/*` (env, intl, logger, analytics, devkit, tsconfig…) are independently
released libraries from the `raypx-kit` repository, pinned to exact versions.
How the pieces talk: [architecture](references/architecture.md).

## Capabilities

| Capability                         | Where                                            | Reference                                                  |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Authentication                     | `@raypx/auth`, Better Auth on API                | [auth](references/auth.md)                                 |
| Database                           | `@raypx/database`, PostgreSQL + Drizzle          | [database](references/database.md)                         |
| API and RPC                        | `apps/api`, oRPC contracts in `@raypx/contracts` | [api](references/api.md)                                   |
| Email                              | `@raypx/mail`, Resend                            | [email](references/email.md)                               |
| Agent tasks and remote control     | `@raypx/tasks`, relay, Desktop + CLI             | [remote-tasks](references/remote-tasks.md)                 |
| Local runtime                      | `apps/cli`: files, Cron jobs, tools, terminals   | [local-runtime](references/local-runtime.md)               |
| Internationalization               | `@raypx/i18n` on `@raypx-kit/intl`               | [internationalization](references/internationalization.md) |
| Design system                      | `@raypx/ui`: shadcn/Base UI, tokens              | [design-system](references/design-system.md)               |
| Analytics and browser errors       | `@raypx/analytics` on PostHog, opt-in            | [analytics](references/analytics.md)                       |
| Observability                      | `@raypx-kit/logger` (evlog) in API and CLI       | [observability](references/observability.md)               |
| Rate limiting and security headers | API and Web                                      | [security](references/security.md)                         |
| Server cache                       | `apps/api/server/cache`: Redis or memory         | [caching](references/caching.md)                           |
| Object storage                     | `@raypx/storage`, `runtime.storage` in API       | [storage](references/storage.md)                           |
| Deployment                         | Node or Cloudflare Workers; Desktop packages     | [deployment](references/deployment.md)                     |
| Environment and setup              | `@raypx-kit/env`, `.env`, toolchain              | [setup](references/setup.md)                               |

Not present: payments, CMS, SEO tooling, feature flags, webhooks, push or in-app
notifications (Desktop only shows a native pending-approval notice), collaboration,
AI SDK features, file upload endpoints and server-side error alerting. Say so instead of inventing
them; add a package only when its responsibility and consumers exist.

## Rules that bite

- Applications are composition roots: nothing imports them. Libraries are consumed
  only through `package.json` exports; never import private source paths.
- Every manifest declares `raypx.kind`/`raypx.target`; the workspace graph stays
  acyclic, including devDependencies. `bun run policy` enforces all of this.
- Auth receives its database adapter, config and mailer from API.
- Remote (`contracts/api`) and local (`contracts/local`) contracts stay separate;
  local methods are never registered on public RPC.
- Desktop launches the bundled CLI by absolute path and never imports CLI source.
- Web renders through the API: never import API, auth server or database code there,
  and do not duplicate API behavior in TanStack Start server functions.
- Never log credentials, tokens, cookies, passwords or private file content.
- Never run migrations or destructive commands against the retired database.
- Do not hand-edit `routeTree.gen.ts`, vendored `.agents/skills/*` or generated migrations.

## Common tasks

```sh
bun run workspace:new <name> --kind library --target universal --tests --write
bun run --cwd <workspace> test        # narrow tests first
bun run verify                        # default gate: no GUI, database or mail needed
bun run db:generate && bun run db:migrate   # after changing packages/database schema
bun run i18n:check                    # catalog parity for en/zh
bunx shadcn@latest add <component>    # run inside apps/web; writes into packages/ui
bun run build:web:cloudflare          # optional Worker output in .output-cloudflare
```

Generic recipes (new workspace, new route, Kit library changes):
[workflows](references/workflows.md). Capability-specific steps live in each reference.
Gates beyond `verify` (PostgreSQL, e2e, packaged Desktop): [verification](references/verification.md).
