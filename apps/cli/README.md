# Raypx CLI

The compiled `raypx` executable needs no installed Node or Bun. Desktop bundles the same version and starts private `stdio` mode; only that mode schedules tasks. Foreground commands run once and never install a service.

Terminals, Agents and external commands started by the CLI can run `bun` and `bunx` without an installed Bun: the CLI appends shims for its embedded Bun to the end of their PATH, so an installed Bun still wins. `runtime.info` returns the absolute `bun` shim for commands that need an executable path.

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

Build with `bun run --cwd apps/cli build`. Vite+ `vp pack` bundles and minifies the ESM entry and dependencies into `dist/main.mjs`, then its build hook uses the pinned Bun runtime to create `dist/raypx` (`raypx.exe` on Windows) with bytecode enabled. The executable remains self-contained; the intermediate JavaScript is not needed at runtime. Vite+'s Node SEA `exe` option is not used because the CLI depends on Bun APIs.

`bun run --cwd apps/cli smoke` runs the actual binary outside the repository with an empty PATH, exercises NDJSON, persistent grants, a PTY and EOF process cancellation. Desktop GUI tests remain separate.
