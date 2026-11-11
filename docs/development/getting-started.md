# Development

Desktop uses the MyGo/Go host; the CLI/daemon remains Bun/TypeScript.

Use Bun 1.4.4; it is the only JavaScript runtime. package.json `packageManager`
pins it; to upgrade, change that, then fix what `bun run policy` reports.

mise is the recommended version manager on macOS, Linux and Windows. The committed
mise.toml only lets it read that pin and must never list `[tools]`:

```sh
mise trust && mise install          # once per clone
eval "$(mise activate zsh)"         # in ~/.zshrc (bash/fish/PowerShell also supported)
```

Activated shells switch versions on cd; without activation use `mise exec -- <command>`.
Raypx uses mise for Bun selection and Go 1.27.3 for the native host. The repository does not use a Nix shell.
Windows Desktop uses WebView2 and the Windows packaging/signing tools. The MyGo
host builds with `CGO_ENABLED=0`; it does not require a C/C++ compiler for that build.
The configured macOS package minimum is 13.5.
Direct Bun installs also work. `bun run doctor` confirms the active runtime. PostgreSQL client tools come from the compose container:
`docker compose exec postgres psql -U raypx raypx_foundation`.

Desktop's Go module lives in apps/desktop. Daily `bun run verify` selects affected
JavaScript and Go checks; `bun run verify --full` checks all current-platform sources
and artifacts for release preparation or an explicit full-validation request.
Shared JS configuration/lockfile changes broaden source checks without starting
native runners. See the [Desktop guide](desktop.md#build-and-release).

`bun install` runs the root `prepare` script, which installs the Vite+ Git hook
dispatcher (`core.hooksPath` → `.vite-hooks/_`). The pre-commit hook runs `vp staged`:
oxfmt and oxlint fixes on staged files only. The `commit-msg` hook checks the
[commit subject format](../../CONTRIBUTING.md#commit-messages). Check hook installation
with `bun --bun vp hooks status`.
`VP_GIT_HOOKS=0` skips installation and hooks. Type checks and tests stay in `bun run verify`.

Remote tasks require Redis. `docker compose up -d valkey` starts Valkey on 6380; set
`REDIS_URL=redis://localhost:6380` to cache sessions and keep rate limits in Redis
instead of PostgreSQL. API sessions remain persisted in PostgreSQL.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start `docker compose up -d postgres` (PostgreSQL on 5433, Valkey on 6380),
then run `bun run dev`. API startup applies pending foundation migrations before
initializing its runtime. Set `DATABASE_MIGRATE_ON_START=false` to skip this step
when migrations are managed separately; `bun run db:migrate` remains available explicitly.
Never point API startup or migration commands at the retired database or volume.
bun run db:studio opens Drizzle Studio (read/write) on the raypx_foundation schema of DATABASE_URL.

bun run dev starts Web (Start SSR on 3000) and the combined backend (3002).
Nitro hosts `/relay` alongside HTTP. Redis is optional for this default topology;
set `SERVER_ROLE=api` and run another copy with `SERVER_ROLE=relay` only when
using a shared private broker. See [backend roles](../architecture/0051-backend-runtime-roles.md).
bun run dev:desktop starts Desktop development;
bun run package:desktop packages it with its version-matched CLI. Phones use the Web
application for the remote workbench. An Expo Mobile account/login baseline is
also available through `bun run dev:mobile`; see [Mobile](mobile.md).
Desktop reads its connection at runtime from `~/.raypx/config.toml`, defaulting
to production. To use the local API, set `base_url = "http://localhost:3002"`
and `web_url = "http://localhost:3000"`, then fully quit and restart Desktop.
Use a separate absolute `RAYPX_HOME` for isolated development configurations.
See [Desktop configuration](desktop.md#connection-configuration) for profiles/self-hosting.
`VITE_API_URL` and `VITE_WEB_URL` still configure ordinary browser previews/Web
builds; they do not override an installed Desktop's TOML settings.
bun run dev:storybook previews `@raypx/ui` components on 6006; bun run build:storybook
writes the static site to `apps/storybook/dist`.

Bun catalogs hold third-party versions: the default `catalog:` contains shared
runtime libraries, `catalog:mobile` contains Mobile-only dependencies, and
`catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. DOM applications share one exact React/React DOM version;
Mobile pins its Expo-supported React in `catalog:mobile`. Shared peer ranges must
support both. Environment, TypeScript presets and logging are local `@raypx` workspaces;
remaining `@raypx-kit/*` dependencies are independently released external libraries.
Do not add another task runner. Web and API run under Bun in dev, build, preview
and production: scripts call `bun --bun vp`, and each output starts with
`bun .output/server/index.mjs`. Nitro's `bun` preset traces Bun export conditions.

Actual verification/reset emails require RESEND_API_KEY and MAIL_FROM. Without a
configured mail transport those actions return MAIL_NOT_CONFIGURED instead of
claiming delivery. Tests inject an explicit in-memory mail transport.

Bun uses the isolated install layout: each workspace resolves only the packages it
declares, so a missing dependency fails at install or build time instead of
resolving through another workspace. DOM bundlers deduplicate React; Mobile's
Metro resolver selects its own React/JSX instance for shared source. Policy still
checks every declared production import.

## Local CLI

Build with `bun run build:cli`, then use `apps/cli/dist/raypx` (`raypx.exe` on
Windows), or run the source with `bun run --cwd apps/cli dev --help`.
The citty command tree provides `raypx --help`, `raypx files --help` and
`raypx files read --help`. Register the selected profile with `raypx login`
before using local execution commands; see [registration](#register-local-execution). JSON-parameter commands include:

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
On macOS/Windows the independent CLI daemon schedules jobs and survives GUI Quit.
The private foreground `stdio` runtime can also own scheduling when used directly.
One-shot commands and TUI keep scheduling disabled and close only their own runtime.

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
profiles, an empty PATH and a relocated complete CLI payload. The full host/owner protocol,
live output and cross-owner controls remain proposed.

## Build caches

`bun run clean:artifacts` removes validation evidence, coverage, test-report caches
and browser reports while preserving builds and staged native resources. See
[validation scripts and cleanup](validation-artifacts.md) for the maintained checks
and retention rules. Keep reusable scripts in Tooling, never in `.artifacts/`.

`bun run clean` removes workspace build outputs, coverage, VP/Vitest and TanStack caches,
Desktop's renderer artifacts and MyGo generated/resource directories, root
`.artifacts`, and browser test results/reports. Removals run in batches of up to eight directories.
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

GitHub CI restores Bun downloads before frozen installs outside Windows, then restores VP's
task-cache directory. Only successful tasks become reusable entries, even if a
later check fails. Cache archives use a fresh key per workflow attempt with a
compatible fallback; OS, architecture, Bun versions and job partition them.
Only jobs with new successful VP artifacts upload a cache snapshot.
Task fingerprints choose reusable results.
CI caches this task-cache subdirectory,
not dependencies or the rest of `node_modules`.

Required release artifacts move between jobs through artifacts rather than an
optional cache. No external remote-cache service or Turbo credentials are used.
Inspect reuse with `bun run test --verbose`, or `vp run --last-details` from root.
Include transfer time when measuring CI gains. See the [testing guide](testing.md).

## Agent skills

Vendored skills live in `.agents/skills/` and `skills-lock.json` records their sources and
hashes; `skills/` and `.claude/skills/` link them for each agent. Run `bun run skills:update`
to pull upstream versions, review the diff, and never edit them by hand. A skill removed
upstream stays installed until you remove it explicitly. Keep only skills for
the current stack and remove retired skills together with both discovery links
and their `skills-lock.json` entry. Lint skips these upstream bytes.

Project guidance lives in root/workspace `AGENTS.md` and this documentation tree.
Update the owning document directly instead of maintaining a second project
manual in a repository-specific skill.

## Register local execution

Before using local files, commands, automations or Agent sessions, register the local instance once. Desktop offers registration after sign-in. For the standalone CLI, run `raypx login` and approve the displayed code on the account page. `RAYPX_API_URL` selects a deployment and `RAYPX_WEB_URL` selects a separate Web origin; HTTPS is required outside loopback. CLI `--profile` selects a distinct local profile when needed.

The signed identity remains usable offline and after online logout. Registration enables no remote Host grant and uploads no project content. Account/origin changes cannot take over the profile. The account page lists and revokes registered instances; a successfully synced revocation blocks local execution and preserves stored history. See [the instance decision](../architecture/0040-instance-enrollment-and-providers.md).

See the [production CLI packaging decision](../architecture/0047-bun-cli-production-packaging.md)
for the payload contract and the [Desktop guide](desktop.md#build-and-release) for
native preparation and platform acceptance.
