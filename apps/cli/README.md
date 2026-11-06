# Raypx CLI

The packaged `raypx` CLI includes its own Node runtime. Desktop bundles the same
version and connects to its independent daemon through private IPC. The daemon
owns scheduling. Foreground commands run once and never install a service.

Run `raypx login` once to enroll the selected profile with an account and server
origin before local execution. Its signed identity permits offline work after
online logout. `RAYPX_API_URL` selects the enrollment server (default
`https://raypx.com`); `RAYPX_WEB_URL` can select a separate account-page origin.
Enrollment and remote Host authorization are separate.

The CLI appends its bundled `node` to child PATH, preserving user-installed tools
first. Project commands use the user's installed package manager; pnpm and pnpx
are not bundled. `runtime.info` exposes the absolute Node path and a user-installed
pnpm path, or null when pnpm is unavailable. Built-in commands need no package manager.
Distribute the complete `dist` directory. Copying only `raypx` is unsupported.

```sh
raypx files authorize /absolute/directory --json
raypx files roots --json
raypx files list '{"rootId":"ROOT_ID","path":""}' --json
raypx files write '{"rootId":"ROOT_ID","path":"note.txt","text":"hello","version":null}' --json
raypx jobs create '{"name":"Hourly scan","cron":"0 * * * *","timezone":"Asia/Singapore","enabled":true,"action":{"type":"directory.scan","rootId":"ROOT_ID","path":""}}' --json
raypx jobs run '{"id":"JOB_ID"}' --json
raypx tools run '{"executable":"/absolute/program","args":[],"cwd":"/absolute/directory"}' --json
```

Use the current file `version` when editing, moving or deleting. Deletion prompts on an interactive terminal; automation must explicitly pass `--yes`. Built-in file APIs reject traversal and symbolic links. External commands have ordinary OS user permissions and are not restricted by file grants.

`--data-dir` and `--profile` select isolated state. Defaults use the platform application-data directory. Definitions and grants are persistent; run logs retain at most 1 MiB per run, 100 runs per job and 30 days. History listings return at most 8 KiB per run. Cron uses five fields and an IANA time zone. Busy tasks are recorded as skipped; missed triggers and interrupted commands are never replayed automatically.

## Build and distribution

Build with `pnpm run build:cli` from the repository root. The normal VP `pack`
build writes an installable `@raypx/cli` package to `apps/cli/dist`, with the
`raypx` bin pointing to `main.mjs`. Install that directory or its tarball with
npm, pnpm or another compatible package manager. For example:

```sh
npm pack ./apps/cli/dist
npm install --global ./raypx-cli-0.1.0.tgz
raypx --version
```

The package requires Node in the root `engines.node` range. It bundles its ESM
dependencies, migration journal, verified Herdr resources for supported platforms,
licenses and a `runtime.json` inventory. It has no install scripts and bundles
neither Node nor a package manager. Project commands use the user's environment.

Desktop packaging takes the same build, retains the host's Herdr resources, and
adds a thin Rust launcher and the actual build's Node runtime. Desktop users need
no global Node. Its launcher forwards arguments, standard streams and exit status.
Connector install/repair and Windows daemon upgrades copy the complete payload;
standalone package installations retain the absolute Node interpreter path.

`pnpm --dir apps/cli run smoke` packs and installs the real tarball with scripts
disabled, checks the package manager's bin with only Node on PATH, and exercises
the relocated application with an empty PATH. It covers commands, NDJSON,
persistent grants, PTYs and EOF cancellation. Desktop GUI tests remain separate.

All stores share `<profile>/profile.sqlite`, initialized with an embedded Drizzle migration.
See [local SQLite storage](../../docs/development/local-sqlite.md) for schema generation and profile format requirements.
