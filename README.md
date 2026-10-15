# Raypx

A TypeScript foundation for Web, Electrobun Desktop and Expo mobile, with shared
accounts, device-local appearance/language settings, and a standalone local CLI.
The previous cloud product is retired; historical decisions remain in docs/history.

## Requirements

Bun 1.4.3, Node 24.15.0 and an isolated PostgreSQL database for account flows.
Use `nix develop` on macOS/Linux, or install those runtime versions directly.
Desktop includes its own native host and compiled CLI; users do not install Node/Bun.

```sh
bun install
cp .env.example .env
# Starts a NEW database on 5433; does not reuse the old volume.
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Web runs on 3000 and API on 3002. Production API starts with
`node apps/api/.output/server/index.mjs`; its complete artifact includes Web assets.
Local desktop files, automations and terminals do not require login. Close-to-tray
keeps scheduling; Quit stops execution. External tools run with the user's OS permissions.

## Commands

```sh
bun run workspace:list
bun run workspace:new example --target universal         # preview
bun run workspace:new example --target universal --write # create
bun run check
bun run test
bun run build
bun run verify
bun run desktop:build
bun run dev:mobile
bun run mobile:bundle
```

Turbo discovers tasks from workspace manifests. Engineering commands are exposed
as `raypx-dev`; the product executable is `raypx`. Workspaces under apps and packages
are discovered automatically, without editing a central name list. Nix supplies
runtimes and tools only; it does not duplicate the task graph or manage databases.

See [documentation](docs/README.md), [architecture](docs/architecture/README.md),
[workspace extension](docs/development/workspaces.md) and [verification](docs/development/testing.md).
