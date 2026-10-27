# Raypx

A foundation for Web and Tauri Desktop, with shared
accounts, device-local appearance/language settings, and a standalone local CLI.
The previous cloud product is retired; historical decisions remain in docs/history.

## Requirements

Bun 1.4.4 and an isolated PostgreSQL database for account flows. Bun is the only
JavaScript runtime; `packageManager` pins it. With [mise](https://mise.jdx.dev),
run `mise trust && mise install` once; direct installs also work.
`bun run doctor` confirms it.
Native Desktop development and packaging require Rust through rustup and the pinned `rust-toolchain.toml`; see the
[Rust workspace guide](docs/development/rust.md).
Desktop includes its own native host and compiled CLI; users do not install Bun.

```sh
bun install
cp .env.example .env
# Starts a NEW database on 5433; does not reuse the old volume.
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Web (TanStack Start SSR) runs on 3000 and API on 3002. They deploy as separate
Bun services: `bun apps/web/.output/server/index.mjs` and
`bun apps/api/.output/server/index.mjs`. Web bakes `VITE_API_URL` at build time.
Its server rendering needs the session cookie: serve both from one origin, or set
`AUTH_DOMAIN` to the parent domain of sibling hosts such as app/api.example.com.
Local desktop files, automations and terminals do not require login. Close-to-tray
keeps scheduling. On macOS and Windows, Quit disconnects the window while the
independent CLI daemon keeps working.
External tools run with the user's OS permissions.

## Commands

```sh
bun run workspace:list
bun run workspace:new example --target universal         # preview
bun run workspace:new example --target universal --write # create
bun run check
bun run test
bun run test unit
bun run test --package tasks
bun run --cwd packages/tasks test
bun run build
bun run verify
bun run rust:verify
cargo run -p raypx-core --locked --example basic
bun run package:desktop
```

VP discovers tasks from workspace manifests. Engineering commands are exposed
as `raypx-dev`; the product executable is `raypx`. Workspaces under apps and packages
are discovered automatically, without editing a central name list.
Use `bun run test --help` or the [test command guide](docs/development/test-commands.md)
for root suites, package-local commands and optional backend/browser gates.
Rust libraries live in `crates/`, with Cargo workspace membership and a shared lockfile.

See [documentation](docs/README.md), [architecture](docs/architecture/README.md),
[workspace extension](docs/development/workspaces.md) and [verification](docs/development/testing.md).
