# Raypx device CLI

The Space device-computer connector runs separately from the retained runtime.
Spaces, Agent conversations, durable Runs, approvals, effects and tools belong to
the PostgreSQL backend. Retained enrollment/profile history does not authorize a
Space and is never imported into server history.

## Space device computers

In Space settings → Devices, create a short-lived pairing code. On the machine
you want to connect, run `raypx device pair`, enter the exact server origin and
code, and confirm the account and Space locally. The connector runs independently
after pairing. Desktop performs the equivalent confirmation with native dialogs
and its absolute bundled CLI. Credentials never enter the renderer.

Grant a directory separately for each Space:

```sh
raypx device grant '{"spaceId":"SPACE_ID"}'
raypx device grants --json
raypx device status --json
raypx device stop --json
raypx device start --json
raypx device revoke-grant '{"grantId":"GRANT_ID"}' --json
raypx device revoke --json
```

`grant` prompts for an absolute directory and always asks for confirmation on the
device. `--yes` and `--json` cannot skip pairing or directory confirmation.
Remote grant requests remain bounded and expire after one minute; Desktop polls
them only for its currently verified account, then asks through its native picker
and confirmation dialog. Without Desktop, use the interactive command above.
Select a connected device and confirmed directory in the conversation Computer
panel. Only the owning member's trusted Runs can use it. The server retains all
execution authority and device commands require approval unless an exact Allow
rule applies; automatic review never authorizes a device command.

Commands run with your OS account's permissions. Directory grants constrain
built-in file operations and the admitted command working directory; **a device
computer is not sandbox isolation**. File calls reject traversal, link components
and replaced roots, and keep connector/profile credentials outside grants.
The connector never inherits provider credentials into commands. Combined command
output is capped at one MiB; each file call is capped at one MiB. Home
export/import/snapshots and Screen are unavailable. Process-group cancellation
cannot contain a command that deliberately escapes its group.

The connector opens an authenticated outbound WebSocket only. It has no inbound
listener and never exposes the retained local router. Disconnection cancels work;
reconnection advances its fence and replays unacknowledged journal progress without
re-executing an accepted operation whose outcome is unknown. Its restricted
credentials and local enforcement journal live under
`<profile>/device-connector`, separate from retained `profile.sqlite`. A profile
binding never moves to a different account or server origin. Use a different
`--profile` for another binding. Local revoke erases its credential even offline;
`serverRevoked: false` means the server record must also be revoked in Web.
Tests use private temporary homes and stop their
own connector afterward.

macOS arm64 source and real-daemon acceptance are verified. Linux remains
unverified; secure Windows device-file operations explicitly remain unavailable.
Packaged native dialog and distribution acceptance are separate platform gates.

## Retained local runtime

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
