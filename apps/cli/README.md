# Raypx device CLI (retained)

This retained runtime remains until the device connector replacement phase. New
Spaces, Agent conversations, durable Runs and tools belong to the PostgreSQL
backend. Local enrollment/profile history does not authorize a Space and is never
imported into server history.

Raypx's TypeScript CLI and independent daemon run in the compiled `raypx`
executable, with no installed Node.js or Bun required. Desktop uses a
MyGo/Go host and bundles this same CLI payload, connecting through private IPC.
The daemon owns scheduling; foreground commands own their work and never install
a service.

The accepted production packaging
embeds the Bun 1.4.4 stable runtime with minified ESM and depth-0 bytecode.

Run `raypx login` once to enroll the selected profile with an account and server
origin before local execution. It prints an instance code for approval at the
account page and waits for that human confirmation. Its signed identity permits
offline work after online logout. `RAYPX_API_URL` selects the enrollment server (default
`https://raypx.com`); `RAYPX_WEB_URL` can select a separate account-page origin.
Enrollment and remote Host authorization are separate.

Terminals, Agents and external commands started by the CLI can run `bun` and `bunx` without an installed Bun: the CLI appends shims for its embedded Bun to the end of their PATH, so an installed Bun still wins. `runtime.info` returns the absolute `bun` shim for commands that need an executable path.

```sh
raypx files authorize /absolute/directory --json
raypx files roots --json
raypx files list '{"rootId":"ROOT_ID","path":""}' --json
raypx files write '{"rootId":"ROOT_ID","path":"note.txt","text":"hello","version":null}' --json
raypx jobs create '{"name":"Hourly scan","cron":"0 * * * *","timezone":"Asia/Singapore","enabled":true,"action":{"type":"directory.scan","rootId":"ROOT_ID","path":""}}' --json
raypx jobs create '{"name":"Daily project summary","projectId":"PROJECT_ID","cron":"0 9 * * 1-5","timezone":"Asia/Shanghai","action":{"type":"agent.run","prompt":"Summarize the current project status."}}' --json
raypx jobs run '{"id":"JOB_ID"}' --json
raypx jobs history '{"id":"JOB_ID"}' --json
raypx tools run '{"executable":"/absolute/program","args":[],"cwd":"/absolute/directory"}' --json
```

Use the current file `version` when editing, moving or deleting. Deletion prompts on an interactive terminal; automation must explicitly pass `--yes`. Built-in file APIs reject traversal and symbolic links. External commands have ordinary OS user permissions and are not restricted by file grants.

`--data-dir` and `--profile` select isolated state. Defaults use the platform application-data directory. Definitions and grants are persistent. Run logs retain at most 1 MiB per run, 100 runs per job and 30 days. History listings return at most 8 KiB per run. Cron uses five fields and an IANA time zone. Each scheduled occurrence has one run record. Busy tasks are recorded as skipped. Missed and interrupted occurrences are skipped after restart. Under the job lease, startup and history reads recover the result of a completed Pi session or mark the abandoned run as interrupted.

Enable Pi for the granted project and configure a device model before running a Pi automation.
`jobs run` returns immediately for Pi and the daemon continues the session in the background.
Use `jobs history` for the session ID, `tasks get` for its result and `tasks approvals list`
for pending decisions. See [managed Pi automations](../../docs/development/ai.md#local-pi-automations).
Local Pi automations also accept `triggers: { webhook: true, email: { sender: "owner@example.com" } }`.
Use either trigger, or both, and include `cron` and `timezone` only if it also runs on a schedule.
Configure the [daemon receiver](../../docs/development/ai.md#webhook-and-email-triggers) before sending events.
`triggers.github` accepts a `repository` such as `owner/repo` and an `events` list containing
`push`, `issues`, or `pull_request`. `triggers.files` accepts a project-relative `path` and an
`intervalMinutes` of 5, 15, 30, 60, 360, or 1440. Omit Cron for file watching.

Build through Turbo with root `bun run build:cli`, or run the workspace build with
`bun run --cwd apps/cli build`. The build checks the SQLite journal and pinned Bun
version, then compiles `src/main.ts` with ESM, minification and depth-0 bytecode.
`apps/cli/dist/` contains the executable, `herdr/`, `LICENSE`, `README.txt` and the
complete `runtime.json` inventory. Keep the whole payload together. Desktop
staging, daemon copies and connectors verify its resources and hashes; consumers
reuse it through `RAYPX_CLI_PAYLOAD` without compiling another copy.

`bun apps/cli/scripts/distribution.ts archive` creates native macOS arm64 or
Windows x64 archives and SHA-256 files from the prepared payload. Signing and
notarization are separate distribution steps. Artifact checks and source tests
do not establish a platform's installer, GUI or release-signing acceptance.

The retained private `terminal.open` contract can select the daemon's default
shell without an executable or JSON argument list. The current Desktop renderer
has no Terminal screen; this adds no public CLI command. Custom executables remain
absolute paths, and `raypx tools run` still requires its explicit executable.
Herdr supplies the PTY and terminal state.

`bun run --cwd apps/cli smoke` runs the actual binary outside the repository with
an empty PATH, exercising NDJSON, persistent grants, a bundled Herdr PTY and EOF
process cancellation. Desktop GUI tests and live-provider checks remain separate;
Linux Desktop acceptance is unverified.

Profile task state, grants and journals use `<profile>/profile.sqlite`, initialized
with embedded Drizzle migrations.
See [local SQLite storage](../../docs/development/local-sqlite.md) for schema generation and profile format requirements.
