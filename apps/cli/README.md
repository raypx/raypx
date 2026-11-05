# Raypx CLI

The packaged `raypx` CLI needs no global Node or pnpm. Desktop bundles the same
version and connects to its independent daemon through private IPC. The daemon
owns scheduling. Foreground commands run once and never install a service.

Run `raypx login` once to enroll the selected profile with an account and server
origin before local execution. Its signed identity permits offline work after
online logout. `RAYPX_API_URL` selects the enrollment server (default
`https://raypx.com`); `RAYPX_WEB_URL` can select a separate account-page origin.
Enrollment and remote Host authorization are separate.

The CLI appends its bundled `node`, `pnpm` and `pnpx` to child PATH, preserving
user-installed tools first. `runtime.info` exposes absolute Node/pnpm paths.
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

Build with `pnpm run build:cli` from the repository root. VP `pack` bundles the
ESM entry and dependencies; its hook builds the Rust launcher and stages the
complete matching runtime. Builds require the pinned Node/pnpm and Rust toolchains.
The distribution contains:

- `raypx` (`raypx.exe` on Windows): the thin native launcher.
- `main.mjs` and ESM chunks: the application and embedded database migration journal.
- `runtime/`: Node, the pnpm package and native executable, a pnpx wrapper, and their licenses.
- Herdr resources, the Raypx license and `runtime.json` with versions, build identity and file checksums.

The launcher locates this directory, starts its bundled Node with the ESM entry,
forwards arguments and standard streams, and returns the child exit status.
Connector install/repair and Windows daemon upgrades copy the complete runtime.
Never treat `process.execPath` as the Raypx launcher; in JS it identifies Node.

`pnpm --dir apps/cli run smoke` relocates the complete distribution outside the
repository, uses an empty PATH, and exercises commands, NDJSON, persistent grants,
a PTY and EOF process cancellation. Desktop GUI tests remain separate.

All stores share `<profile>/profile.sqlite`, initialized with an embedded Drizzle migration.
See [local SQLite storage](../../docs/development/local-sqlite.md) for schema generation and profile format requirements.
