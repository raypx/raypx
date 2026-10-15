# Getting Started

## Requirements

- Bun `1.4.3`
- Electrobun native SDK (Desktop scripts prepare its pinned version)
- PostgreSQL when persistent data is required

Versions are pinned in the root repository configuration. Prefer repository
scripts over globally installed tooling.

## Setup

```bash
cp .env.example .env
bun install
bun run generate
bun run db:migrate
bun run dev
```

`DATABASE_URL` is required by API and Worker and must point to a fresh PostgreSQL
database for the cloud migration baseline. Authentication uses the
Better Auth cookie session; local auth emails are logged when Resend is not
configured.

Compose creates the `raypx` database in the `raypx-postgres` volume. To reuse
an existing local database after the rename, set `RAYPX_POSTGRES_DB` and
`RAYPX_POSTGRES_VOLUME` to its existing names before starting Compose, and keep
`DATABASE_URL` pointed at that database. Inspect volume names with
`docker volume ls`; keep the existing volume until its data has been backed up.

Redis is optional for local development. Production AI admission requires
`REDIS_URL`; authentication always uses PostgreSQL. See
[deployment](../architecture/deployment.md) for storage and document converter
configuration. Live Search/Computer remains unavailable after
[the AI package removal](../architecture/decisions/0027-remove-pi-sdk.md);
provider credentials cannot enable it.

## Environment files

The root `.env.example` is the only committed complete example. Put shared
local values in root `.env` and machine-specific overrides in root
`.env.local`. Env-sensitive development and build scripts use:

```bash
rpx env -- <command>
```

The runner resolves the repository root from `@raypx/scripts`, so it behaves
the same from the repository root or a workspace directory. It loads
`.env.local` before `.env`, while Dotenvx preserves values already provided by
the calling shell. The resulting priority is:

```text
process.env > .env.local > .env > schema defaults
```

Workspaces decide which scripts need file-backed environment values. Web,
API, Worker and Desktop use the runner for development and builds; database
and deployment-oriented repository commands use it as needed. Unit tests stay
outside the runner and must provide `runtimeEnv` or test stubs explicitly
rather than depend on values from a developer's files.

Dotenvx only loads files. `@voidmix/env` still owns schema composition,
defaults, normalization, and validation. Unknown variables are ignored.

## Common commands

```bash
bun run dev
bun run doctor
bun run clean
bun run clean:all
bun run deps:check
bun run deps:update
bun run deps:dedupe:check
bun run deps:audit
bun run skills:update
bun run check
bun run test
bun run build
bun run db:migrate
bun run db:push
bun run db:clean
bun run db:studio
bun run desktop:build
bun run verify
```

`desktop:build` enters the root renderer build/check gate, then packages the
Electrobun stable native bundle. Desktop scripts prepare the pinned SDK through
the workspace-local bootstrap; Rust/Cargo and a global Hutch install are unnecessary.
Use `bun run --cwd apps/desktop native:dev` for the native development shell.

Those names are aliases for nested `rpx` commands, which is what the scripts call.
Reach for the CLI directly when you need to pass an argument:

```bash
bun run rpx db migrate
bun run rpx db push
bun run rpx db clean
bun run rpx db studio
bun run rpx desktop build
```

## Local PostgreSQL

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:studio
```

`db:push` is the throwaway alternative to `generate` plus `db:migrate`: it
diffs `src/schema.ts` against a development or test database and applies the
change without writing a migration. Use it while a schema is still in flux, and
generate a migration before committing. Flags reach `drizzle-kit` unchanged,
which matters because an ambiguous diff exits 2 and asks to be re-run with
hints:

```bash
bun run db:push -- --hints '[{"type":"create","kind":"table","entity":["public","users"]}]'
```

`db:clean` is the reset that pairs with both: it drops the `drizzle` and
`public` schemas and recreates an empty `public`. It takes every table and the
migration history with it, and there is no confirmation prompt — the
development/test guard is the only thing standing between the command and the
database `DATABASE_URL` points at.

## Application ports

```text
Web      http://localhost:3000
API      http://localhost:3002 (RPC and Auth)
Desktop  TanStack Start SPA dev server on port 1420 for browser preview; native shell uses Electrobun
```

See [Runtime and deployment](../architecture/deployment.md) for production
boundaries and [Testing](./testing.md) before submitting changes.
