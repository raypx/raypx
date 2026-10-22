# Development

Use Bun 1.4.4 and Node 24.15.0. `.nvmrc` pins Node and package.json `packageManager`
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

`bun install` runs the root `prepare` script, which installs the Vite+ Git hook
dispatcher (`core.hooksPath` → `.vite-hooks/_`). The pre-commit hook runs `vp staged`:
oxfmt and oxlint fixes on staged files only. Check it with `bun --bun vp hooks status`;
`VP_GIT_HOOKS=0` skips installation and hooks. Type checks and tests stay in `bun run verify`.

Redis is optional. `docker compose up -d valkey` starts Valkey on 6380; set
`REDIS_URL=redis://localhost:6380` to cache sessions and keep rate limits in Redis
instead of PostgreSQL. Node API only; Workers keep using PostgreSQL.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start the separate compose database on 5433, then bun run db:migrate and bun run dev.
Never point these migration commands at the retired database or volume.

bun run dev starts Web (Start SSR on 3000) and API (3002). bun run dev:desktop starts Desktop development;
bun run package:desktop packages it with its version-matched CLI. Phones use the Web
application; a native mobile app is deferred until it needs native capabilities.
bun run dev:storybook previews `@raypx/ui` components on 6006; bun run build:storybook
writes the static site to `apps/storybook/dist`.

Bun catalogs hold third-party versions: the default `catalog:` contains runtime
libraries, and `catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. All workspaces share one exact React
version. Raypx Kit stays external. Do not add another task runner. Web and API run under Node in dev, build, preview
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

## Local CLI

Build with `bun run build:cli`, then use `apps/cli/dist/raypx` (`raypx.exe` on
Windows), or run the source with `bun run --cwd apps/cli dev --help`.
The citty command tree provides `raypx --help`, `raypx files --help` and
`raypx files read --help`. Existing JSON-parameter commands remain available:

```sh
raypx files authorize /absolute/directory --json
raypx files roots --json --profile work
raypx jobs list --json
raypx files read '{"rootId":"grant-id","path":"notes.txt"}' --json
```

Global `--profile`, `--data-dir`, `--json` and `--yes` can appear before or after
command words. Unknown, missing, empty and repeated options fail explicitly.
String options also accept `--profile=work`. Use `--` to end option parsing;
all following arguments remain operands, for example
`raypx --json files authorize -- /absolute/directory`. Tools still take one
JSON command object; their executable argv belongs in its `args` array.
`--version`/`-v` print the version, and `--help`/`-h` select help.
Results retain the current bare JSON shape; errors and diagnostics use stderr.
Only Desktop's private `stdio` engine schedules jobs; foreground commands run
once and close their runtime.

`raypx tui --profile work` opens a lightweight task browser when stdin and stdout
are both terminals. Enter `t` for tasks, select a number, then `r` to run once
after typing `yes`, or `h` for history. Results and retained output are paginated.
Use `b` to return and `q` to quit. While running, `q` asks for confirmation to
cancel the session's work and quit; Ctrl-C/SIGINT and SIGTERM clean up immediately
and exit with 130 and 143. It never starts a scheduler or controls another runtime.
Language follows `LC_ALL`, `LC_MESSAGES`, then `LANG`; `l` switches English/Chinese
for the session. The menu inherits terminal colors and supports narrow/dumb terminals.
It rejects redirected input/output and `--json`/`--yes`; `raypx tui --help` works
without a TTY. Bare `raypx` still prints help.

Run `bun run --cwd apps/cli smoke:tui` after building for the explicit POSIX PTY
gate. It requires system Python 3 only for the test harness and uses temporary
profiles, an empty PATH and a relocated single binary. The full host/owner protocol,
live output and cross-owner controls remain proposed in the
[CLI design](../plans/cli-desktop-runtime.md).

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

## Cloudflare deployment target

Web and API also provide explicit Cloudflare Worker build, preview and deployment
commands alongside their default Node outputs. See [Node and Cloudflare deployments](cloudflare.md)
for runtime bindings, PostgreSQL/Hyperdrive and both artifact verification gates.
