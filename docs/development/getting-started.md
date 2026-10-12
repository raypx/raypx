# Getting Started

## Requirements

- Bun `1.4.0`
- Node.js `24.18.0`
- Rust/Cargo for Desktop development and packaging
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
database for the cloud migration baseline. Admin authentication uses the
Better Auth cookie session; local auth emails are logged when Resend is not
configured.

Redis is optional for local development. Production AI admission requires
`REDIS_URL`; authentication always uses PostgreSQL. See
[deployment](../architecture/deployment.md) for model, search, storage and
document converter configuration before enabling Search or Computer.

## Environment files

The root `.env.example` is the only committed complete example. Put shared
local values in root `.env` and machine-specific overrides in root
`.env.local`. Env-sensitive development and build scripts use:

```bash
vmx env -- <command>
```

The runner resolves the repository root from `@voidmix/scripts`, so it behaves
the same from the repository root or a workspace directory. It loads
`.env.local` before `.env`, while Dotenvx preserves values already provided by
the calling shell. The resulting priority is:

```text
process.env > .env.local > .env > schema defaults
```

Workspaces decide which scripts need file-backed environment values. Web,
Admin, API, and Desktop use the runner for development and builds; database
and deployment-oriented repository commands use it as needed. Unit tests stay
outside the runner and must provide `runtimeEnv` or test stubs explicitly
rather than depend on values from a developer's files.

Dotenvx only loads files. `@voidmix/shared/env` still owns schema composition,
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
bun run db:seed
bun run db:studio
bun run admin:create -- --email owner@example.com --name "Workspace Owner"
bun run desktop:build
bun run verify
```

`desktop:build` sets `CI=true` for Tauri's bundler. On macOS this skips the
optional Finder AppleScript that only positions DMG icons; it avoids requiring
Automation permission and keeps local and CI DMG builds reproducible.

Those names are aliases for nested `vmx` commands, which is what the scripts call.
Reach for the CLI directly when you need to pass an argument:

```bash
bun run vmx db migrate
bun run vmx db push
bun run vmx db clean
bun run vmx db seed
bun run vmx db studio
bun run vmx admin create --email owner@example.com --name "Workspace Owner"
bun run vmx desktop build
```

## Local PostgreSQL

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:seed
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
Admin    http://localhost:3000/admin
API      http://localhost:3000/rpc and http://localhost:3000/api/auth
API                     http://localhost:3002
Desktop  TanStack Start SPA dev server on port 1420 when launched through Tauri
```

See [Runtime and deployment](../architecture/deployment.md) for production
boundaries and [Testing](./testing.md) before submitting changes.
