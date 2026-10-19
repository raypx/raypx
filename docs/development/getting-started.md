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
bun run desktop:build packages it with its version-matched CLI. Phones use the Web
application; a native mobile app is deferred until it needs native capabilities.

Bun catalogs hold third-party versions: the default `catalog:` contains runtime
libraries, and `catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. All workspaces share one exact React
version. Voidmix stays external. Do not add another task runner. Web and API run under Node in dev, build, preview
and production: scripts call `bun vp`, not `bun --bun vp`, and each output starts
with Node .output/server/index.mjs. Their node-server output traces Node export
conditions, which the Bun runtime does not resolve. Tests still run through Bun.

Actual verification/reset emails require RESEND_API_KEY and MAIL_FROM. Without a
configured mail transport those actions return MAIL_NOT_CONFIGURED instead of
claiming delivery. Tests inject an explicit in-memory mail transport.

Bun uses the isolated install layout: each workspace resolves only the packages it
declares, so a missing dependency fails at install or build time instead of
resolving through another workspace. One exact React version keeps a single
physical instance. Policy still checks every declared production import.

## Build caches

Turbo owns the task graph and caches declared build outputs; Vite+ runs the leaf
commands. Use the root build/check/test commands to preserve dependency ordering.
Language policy lives in i18n's public static `./config` export. Repository checks
read that declaration without importing the i18n runtime, so translation edits do
not invalidate unrelated tasks through root tooling.

GitHub CI restores Bun downloads before every frozen install. It restores
`.turbo/cache` after installation, then saves successful task results at the end
of the job, including when a later test fails. Bun caches use the lockfile hash
with a compatible fallback; Turbo uses a fresh key per workflow attempt and lets
its own input hashes select reusable tasks. OS, architecture and tool versions
separate incompatible caches; Turbo archives are also separated by job.

The workflow caches downloads and Turbo results, not `node_modules`. A cache miss
still runs the normal install and tasks. Required release artifacts must be passed
between jobs with artifacts rather than relying on an optional cache. This setup
needs no remote-cache service; the existing trusted remote-cache opt-in remains a
separate mechanism. To check local reuse, repeat a root build and inspect Turbo's
hit counts. Include cache transfer time when measuring CI improvements.
