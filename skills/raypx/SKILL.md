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
mise trust && mise install            # Bun 1.4.3 (packageManager) + Node 24.15.0 (.nvmrc)
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
| `packages/tooling`   | tooling / bun | `raypx-dev` CLI: policy, tasks, verify, smoke, db                     |
| `e2e`                | tooling / bun | Chromium acceptance of Web and Desktop renderer                       |

`@raypx-kit/*` (env, intl, logger, analytics, devkit, tsconfig…) are independently
released libraries from the `raypx-kit` repository, pinned to exact versions.
More: [architecture](references/architecture.md).

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
bun run generate && bun run db:migrate   # after changing packages/database schema
bun run i18n:check                    # catalog parity for en/zh
bunx shadcn@latest add <component>    # run inside apps/web; writes into packages/ui
bun run build:web:cloudflare          # optional Worker output in .output-cloudflare
```

Step-by-step recipes (new route, new RPC procedure, translations, analytics events,
Kit library changes, releases): [workflows](references/workflows.md).
Gates beyond `verify` (PostgreSQL, e2e, packaged Desktop): [verification](references/verification.md).
