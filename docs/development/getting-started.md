# Development

Use Node 24.22.2 and pnpm 12.16.1. Root `engines.node` and `packageManager`
are their respective pins; `pnpm run policy` checks all mirrored configuration.
`pnpm run workspace:sync` regenerates pnpm workspace patterns, catalogs and
overrides from root package.json. Use pnpm's default isolated dependency layout.

mise is the recommended Node version manager. `mise.toml` only enables reading
package.json and has no `[tools]` pins. Run `mise trust && mise install`, activate
mise in your shell, then install the pnpm version named by `packageManager`.
`pnpm run doctor` confirms the active runtime.

Native Desktop requires the Rust 1.99.1 toolchain from `rust-toolchain.toml` and
Tauri 2.12.5. macOS needs Xcode command-line tools and 13.5+; Windows needs the
MSVC C++ build tools and WebView2. Linux Desktop remains unverified; Linux core
Rust checks do not establish GUI acceptance. There is no Go or Nix shell.

Daily `pnpm run verify` selects affected types/tests and native inputs. Shared JS
configuration broadens source checks without automatically selecting native
runners. `pnpm run verify --full` adds complete audits, builds and artifact probes.
See the [Desktop guide](desktop.md#build-and-release).

`pnpm install` installs the Vite+ hook dispatcher. Pre-commit runs `vp staged`
(format/lint fixes on staged files). Check with `pnpm exec vp hooks status`;
`VP_GIT_HOOKS=0` skips hook installation/execution. Types/tests remain in verify.

Remote tasks require Redis. `docker compose up -d valkey` starts Valkey on 6380; set
`REDIS_URL=redis://localhost:6380` to cache sessions and keep rate limits in Redis
instead of PostgreSQL. API sessions remain persisted in PostgreSQL.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start `docker compose up -d postgres valkey` (PostgreSQL on 5433, Valkey on 6380),
then run `pnpm run dev`. API startup applies pending foundation migrations before
initializing its runtime. Set `DATABASE_MIGRATE_ON_START=false` to skip this step
when migrations are managed separately; `pnpm run db:migrate` remains available explicitly.
Never point API startup or migration commands at the retired database or volume.
pnpm run db:studio opens Drizzle Studio (read/write) on the raypx_foundation schema of DATABASE_URL.

pnpm run dev starts Web (Start SSR on 3000), API (3002) and Relay (3003). The API Vite
development proxy forwards `/relay` to the independent service; production uses
the shared gateway. See [Relay](../../infra/relay/README.md).
pnpm run dev:desktop starts Desktop development;
pnpm run package:desktop packages it with its version-matched CLI. Phones use the Web
application for the remote workbench. An Expo Mobile account/login baseline is
also available through `pnpm run dev:mobile`; see [Mobile](mobile.md).
Desktop reads its connection at runtime from `~/.raypx/config.toml`, defaulting
to production. To use the local API, set `base_url = "http://localhost:3002"`
and `web_url = "http://localhost:3000"`, then fully quit and restart Desktop.
Use a separate absolute `RAYPX_HOME` for isolated development configurations.
See [Desktop configuration](desktop.md#connection-configuration) for profiles/self-hosting.
`VITE_API_URL` and `VITE_WEB_URL` still configure ordinary browser previews/Web
builds; they do not override an installed Desktop's TOML settings.
pnpm run dev:storybook previews `@raypx/ui` components on 6006; pnpm run build:storybook
writes the static site to `apps/storybook/dist`.

pnpm catalogs hold third-party versions: the default `catalog:` contains shared
runtime libraries, `catalog:mobile` contains Mobile-only dependencies, and
`catalog:dev` contains build, test and development tools. Shared
libraries keep the same catalog even when a test workspace lists them under
`devDependencies`. All workspaces share one exact React
version. Environment, TypeScript presets and logging are local `@raypx` workspaces;
remaining `@raypx-kit/*` dependencies are independently released external libraries.
Do not add another task runner. Web and API run under Node in dev, build, preview
and production: scripts call `vp`, and each output starts with
`node .output/server/index.mjs`. Nitro uses the `node-server` preset.

Actual verification/reset emails require RESEND_API_KEY and MAIL_FROM. Without a
configured mail transport those actions return MAIL_NOT_CONFIGURED instead of
claiming delivery. Tests inject an explicit in-memory mail transport.

pnpm uses the isolated install layout: each workspace resolves only the packages it
declares, so a missing dependency fails at install or build time instead of
resolving through another workspace. One exact React version keeps a single
physical instance. Policy still checks every declared production import.

## Local CLI

Build with `pnpm run build:cli`, then use `apps/cli/dist/raypx` (`raypx.exe` on
Windows), or run the source with `pnpm --dir apps/cli run dev --help`.
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

Run `pnpm --dir apps/cli run smoke:tui` after building for the explicit POSIX PTY
gate. It requires system Python 3 only for the test harness and uses temporary
profiles, an empty PATH and a relocated complete CLI runtime directory. The full host/owner protocol,
live output and cross-owner controls remain proposed.

## Build caches

`pnpm run clean:artifacts` removes validation evidence, coverage, test-report caches
and browser reports while preserving builds and staged native resources. See
[validation scripts and cleanup](validation-artifacts.md) for the maintained checks
and retention rules. Keep reusable scripts in Tooling, never in `.artifacts/`.

`pnpm run clean` removes workspace build outputs, coverage, VP/Vitest and TanStack caches,
Desktop's renderer artifacts and Tauri generated/resource directories, root
`.artifacts`, and browser test results/reports. Removals run in batches of up to eight directories.
It keeps dependencies, lockfiles,
Git history, environment files, user profiles and database volumes. Native development,
Rust host checks and packaging prepare generated inputs and the matching CLI again.

VP owns the task graph and its local cache at `node_modules/.vite/task-cache`.
Use root build/check/test commands for dependency ordering, or `vp run` to invoke
a private qualified task such as `vp run --filter @raypx/core task:test`.
Public workspace scripts remain direct leaf/debug commands. `vite.config.ts`
contains lightweight task metadata; application plugins live in `vite.app.config.ts`.
Language policy lives in i18n's public static `./config` export; repository checks
read it without importing the i18n runtime.

GitHub CI restores pnpm downloads before frozen installs outside Windows, then restores VP's
task-cache directory. Only successful tasks become reusable entries, even if a
later check fails. Cache archives use a fresh key per workflow attempt with a
compatible fallback; OS, architecture, Node/pnpm versions and job partition them.
Only jobs with new successful VP artifacts upload a cache snapshot.
Task fingerprints choose reusable results.
CI caches this task-cache subdirectory,
not dependencies or the rest of `node_modules`.

Required release artifacts move between jobs through artifacts rather than an
optional cache. No external remote-cache service or Turbo credentials are used.
Inspect reuse with `pnpm run test --verbose`, or `vp run --last-details` from root.
Include transfer time when measuring CI gains. See the [testing guide](testing.md).

## Agent skills

Vendored skills live in `.agents/skills/` and `skills-lock.json` records their sources and
hashes; `skills/` and `.claude/skills/` link them for each agent. Run `pnpm run skills:update`
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
