# Development

Use Bun 1.4.3 and Node 24.15.0. `.nvmrc` pins Node and package.json `packageManager`
pins Bun; to upgrade, change those, then fix what `bun run policy` reports.

mise is the recommended version manager on macOS, Linux and Windows. The committed
mise.toml only lets it read those two pins and must never list `[tools]`:

```sh
mise trust && mise install          # once per clone
eval "$(mise activate zsh)"         # in ~/.zshrc (bash/fish/PowerShell also supported)
```

Activated shells switch versions on cd; without activation use `mise exec -- <command>`.
nvm (`nvm use`), fnm or direct installs also work. `bun run doctor` confirms the active
runtimes. PostgreSQL client tools come from the compose container:
`docker compose exec postgres psql -U raypx raypx_foundation`.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start the separate compose database on 5433, then bun run db:migrate and bun run dev.
Never point these migration commands at the retired database or volume.

bun run dev starts Web (Start SSR on 3000) and API (3002). bun run dev:desktop starts Desktop development;
bun run desktop:build packages it with its version-matched CLI. bun run dev:mobile
starts Expo. Mobile first phase validates JS bundles without installing Xcode/Android.

Bun catalogs hold third-party versions: the default `catalog:` contains runtime
libraries, and `catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. All React versions follow Expo's compatible
19.3.0 baseline. Voidmix stays external. Do not add another task runner. Web and API run under Node in dev, build, preview
and production: scripts call `bun vp`, not `bun --bun vp`, and each output starts
with Node .output/server/index.mjs. Their node-server output traces Node export
conditions, which the Bun runtime does not resolve. Tests still run through Bun.

Actual verification/reset emails require RESEND_API_KEY and MAIL_FROM. Without a
configured mail transport those actions return MAIL_NOT_CONFIGURED instead of
claiming delivery. Tests inject an explicit in-memory mail transport.

Bun uses a hoisted install layout so Expo native modules and React have one
physical instance. Policy still checks every declared production import. Expo
Doctor invokes read-only npm explain; its wrapper scopes npm_config_force to that
diagnostic process so the Bun-only install guard remains active for normal commands.
