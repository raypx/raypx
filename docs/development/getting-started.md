# Development

Use Bun 1.4.4; it is the only JavaScript runtime. package.json `packageManager`
pins it; to upgrade, change that, then fix what `bun run policy` reports.

mise is the recommended version manager on macOS, Linux and Windows. The committed
mise.toml only lets it read that pin and must never list `[tools]`:

```sh
mise trust && mise install          # once per clone
eval "$(mise activate zsh)"         # in ~/.zshrc (bash/fish/PowerShell also supported)
```

Activated shells switch versions on cd; without activation use `mise exec -- <command>`.
Raypx keeps mise for Bun selection and rustup for the native toolchain. Nix is not
required: current CI bottlenecks are task selection and cache invalidation, while
Windows acceptance still uses the native MSVC/WebView2 environment.
Direct Bun installs also work. `bun run doctor` confirms the active runtime. PostgreSQL client tools come from the compose container:
`docker compose exec postgres psql -U raypx raypx_foundation`.

Rust libraries live under `crates/`. Install rustup and run `rustup show` to prepare
the version and components in `rust-toolchain.toml`. Daily `bun run verify` selects
affected JS/Go/Rust checks; `bun run verify --full` checks all current-platform sources
and artifacts before delivery. Use Cargo directly for focused Rust debugging.
See the [Rust guide](rust.md) for commands and the initial `raypx-core` library.

`bun install` runs the root `prepare` script, which installs the Vite+ Git hook
dispatcher (`core.hooksPath` → `.vite-hooks/_`). The pre-commit hook runs `vp staged`:
oxfmt and oxlint fixes on staged files only. Check it with `bun --bun vp hooks status`;
`VP_GIT_HOOKS=0` skips installation and hooks. Type checks and tests stay in `bun run verify`.

Redis is optional. `docker compose up -d valkey` starts Valkey on 6380; set
`REDIS_URL=redis://localhost:6380` to cache sessions and keep rate limits in Redis
instead of PostgreSQL. Node API sessions remain persisted in PostgreSQL.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start the separate compose database on 5433, then bun run db:migrate and bun run dev.
Never point these migration commands at the retired database or volume.
bun run db:studio opens Drizzle Studio (read/write) on the raypx_foundation schema of DATABASE_URL.

bun run dev starts Web (Start SSR on 3000) and API (3002). bun run dev:desktop starts Desktop development;
bun run package:desktop packages it with its version-matched CLI. Phones use the Web
application; a native mobile app is deferred until it needs native capabilities.
Desktop reads its connection at runtime from `~/.raypx/config.toml`, defaulting
to production. To use the local API, set `base_url = "http://localhost:3002"`
and `web_url = "http://localhost:3000"`, then fully quit and restart Desktop.
Use a separate absolute `RAYPX_HOME` for isolated development configurations.
See [Desktop configuration](desktop-configuration.md) for profiles/self-hosting.
`VITE_API_URL` and `VITE_WEB_URL` still configure ordinary browser previews/Web
builds; they do not override an installed Desktop's TOML settings.
bun run dev:storybook previews `@raypx/ui` components on 6006; bun run build:storybook
writes the static site to `apps/storybook/dist`.

Bun catalogs hold third-party versions: the default `catalog:` contains runtime
libraries, and `catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. All workspaces share one exact React
version. Raypx Kit stays external. Do not add another task runner. Web and API run under Bun in dev, build, preview
and production: scripts call `bun --bun vp`, and each output starts with
`bun .output/server/index.mjs`. Nitro's `bun` preset traces Bun export conditions.

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
live output and cross-owner controls remain proposed.

## Build caches

`bun run clean:artifacts` removes validation evidence, coverage, test-report caches
and browser reports while preserving builds and SDKs. See
[validation scripts and cleanup](validation-artifacts.md) for the maintained checks
and retention rules. Keep reusable scripts in Tooling, never in `.artifacts/`.

`bun run clean` removes workspace build outputs, coverage, VP/Vitest and TanStack caches,
Desktop's renderer artifacts and MyGo generated/resource directories, root
`.artifacts`, and browser test results/reports. Rust cleanup runs
`cargo clean --workspace --profile dev`, preserving dependency caches and Release
artifacts. Use `bun run rust:clean` for only that Rust step. Cargo is skipped when no
Rust target directory exists. Other removals run in batches of up to eight directories.
It keeps dependencies, lockfiles,
Git history, environment files, user profiles and database volumes. Native development,
Go host checks and packaging prepare generated inputs and the matching CLI again.

VP owns the task graph and its local cache at `node_modules/.vite/task-cache`.
Use root build/check/test commands for dependency ordering, or `vp run` to invoke
a private qualified task such as `vp run --filter @raypx/core task:test`.
Public workspace scripts remain direct leaf/debug commands. `vite.config.ts`
contains lightweight task metadata; application plugins live in `vite.app.config.ts`.
Language policy lives in i18n's public static `./config` export; repository checks
read it without importing the i18n runtime.

GitHub CI restores Bun downloads before every frozen install, then restores VP's
task-cache directory. Only successful tasks become reusable entries, even if a
later check fails. Cache archives use a fresh key per workflow attempt with a
compatible fallback; OS, architecture, Bun versions and job partition them.
Only jobs with new successful VP artifacts upload a cache snapshot. Failed native
jobs do not save the large Cargo cache. Task fingerprints choose reusable results.
CI caches this task-cache subdirectory,
not dependencies or the rest of `node_modules`.

Required release artifacts move between jobs through artifacts rather than an
optional cache. No external remote-cache service or Turbo credentials are used.
Inspect reuse with `bun run test --verbose`, or `vp run --last-details` from root.
Include transfer time when measuring CI gains. See the [testing guide](testing.md).
