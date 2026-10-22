# Setup

Canonical source: [getting started](../../../docs/development/getting-started.md).

## Toolchain

Bun 1.4.3 (root `packageManager`) and Node 24.15.0 (`.nvmrc`). mise reads both pins;
`mise.toml` never lists `[tools]`. Without shell activation use `mise exec -- <cmd>`.
`bun run doctor` confirms the runtimes. Node runs Web and API (`bun vp`, never
`bun --bun vp`, for their dev/build/preview); tests run through Bun.

`bun install` runs the root `prepare` script, which installs the Vite+ pre-commit
hook (`vp staged`: oxfmt and oxlint fixes on staged files). `VP_GIT_HOOKS=0` skips it.

## Environment

Copy `.env.example` to `.env`; `.env.local` has priority and inherited shell values
win. Only development/build/env commands load these files; tests pass explicit values.

| Variable                                                | Used by         | Notes                                                     |
| ------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| `DATABASE_URL`                                          | API, migrations | Compose database on port 5433                             |
| `AUTH_URL`, `AUTH_SECRET`, `WEB_URL`, `ALLOWED_ORIGINS` | API             | Better Auth origin and trust list                         |
| `AUTH_DOMAIN`                                           | API             | Parent domain when Web and API are sibling hosts          |
| `REDIS_URL`                                             | API (Node)      | Optional Redis/Valkey for session cache and rate limits   |
| `VITE_API_URL`                                          | Web, Desktop    | Baked at build time for browser and server                |
| `RESEND_API_KEY`, `MAIL_FROM`                           | API             | Optional; without them mail returns `MAIL_NOT_CONFIGURED` |
| `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`       | Web, Desktop    | Optional; analytics controls stay disabled without them   |

## Database

`docker compose up -d postgres` starts the isolated database on 5433, then
`bun run db:migrate`. After schema changes run `bun run generate`. PostgreSQL tools:
`docker compose exec postgres psql -U raypx raypx_foundation`.

## Local CLI and Desktop

`bun run build:cli` produces `apps/cli/dist/raypx`; `bun run --cwd apps/cli dev --help`
runs from source. `bun run dev:desktop` starts the renderer (1420) and native shell;
`bun run desktop:build` packages Desktop with its version-matched CLI.

## Cloudflare

Optional Worker outputs: `bun run build:web:cloudflare` / `build:api:cloudflare`
(written to `.output-cloudflare`), then the matching `preview:*` and `deploy:*`
scripts. See [dual deployment targets](../../../docs/development/cloudflare.md).
