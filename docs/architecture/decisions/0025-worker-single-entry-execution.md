# ADR-0025: Single Worker entry with Host-owned Run deadlines

## Status

Accepted

Supersedes only the dual-entry artifact decision in
[ADR-0023](0023-worker-vite-nitro-artifact.md). Its Vite+/Nitro build, dependency
tracing, complete artifact cache and development-watch decisions remain in force.
The process and credential isolation of [ADR-0017](0017-gateway-and-task-rounds.md)
and the Bun runtime of [ADR-0024](0024-bun-runtime.md) remain unchanged.

Host dispatch responsibilities are superseded by
[ADR-0026](0026-direct-run-queue-and-retire-task-notifications.md). The single entry,
isolated task processes, deadline and cleanup decisions remain in force.

Pi execution and provider runtime checks are superseded by
[ADR-0027](0027-remove-pi-sdk.md). The single executable, isolated Runner,
deadline, cleanup and independent document verification remain required.

## Context

Host and Runner use the same pinned Bun runtime and deployment artifact, but two
executable inputs require sibling-entry resolution and separate build/probe
fixtures. Execution also needs a deadline that covers grant setup, child startup
and Pi initialization, including a child that cannot respond to cooperative abort.

Runner needs execution operations through its private Gateway. Queue dispatch,
claiming, recovery and lease renewal belong to Host; a full application interface
with unsupported operations obscures that boundary.

## Decision

Build one executable, `.output/server/index.mjs`, through Vite+ and Nitro's Bun
preset. Its default mode starts Host; `--runner` starts one isolated Run. Keep
mode dispatch lightweight and dynamically import Host composition or Runner
execution dependencies only after selecting that mode. Runner startup must not
initialize Host, database connections or provider credentials.

Host forks the same entry with `--runner` for each claimed Run. Keep an explicit
minimal environment, `--no-env-file`, `--no-install` and the scoped durable
RunGrant. An IPC readiness handshake precedes bootstrap delivery. These remain
separate task processes, preserving fault containment and credential separation;
the shared executable does not move execution into Host or Worker threads.

Host allocates an owned temporary directory per Run and passes it in bootstrap.
Execution requires that directory rather than creating or deleting its own root.
After child exit, Host removes it on success, abort or timeout, including a forced
kill that cannot run the child's cleanup.
On Linux/macOS, Runner leads a detached POSIX process group; Host force-kills
remaining same-group descendants after any Runner exit, including normal exit,
before removing scratch. Windows fallback targets only the direct Runner process.

Runner consumes an execution-only port. Shared execution orchestration lives in
`execution.ts`; `cloud.ts` retains Host dispatch and execution-owner polling.
Host owns claiming, renewal, grant lifecycle and the overall deadline. API
Gateway bootstrap supplies authorized conversation history to Runner, and API
owns model metering hooks. Runner uses the private Gateway for authorized
execution, model, research and object operations without unsupported Host
methods or placeholder implementations.

Host owns the overall Run deadline, measured from the `startedAt` established by
the successful claim. Grant setup, IPC readiness, child startup and Pi
initialization all consume that budget. Search has 60 seconds; Computer uses
`limits.taskDurationMs`, whose default remains 20 minutes. API call metering,
immutable Round budgets, lease fencing and cooperative operation signals remain
authoritative within that deadline. This introduces no environment option.

On timeout, Host asks the child to abort, gives it the existing two-second grace
period, then sends SIGKILL if needed. It waits for process exit before completing
cleanup and revokes the grant. Timeout finishes an unfinished Run as `failed`
with `BUDGET_EXCEEDED` under its current owner fence; shutdown or owner loss uses
fenced interruption. Neither path may overwrite a terminal Run or a newer owner.

Keep Nitro's full external dependency assets and cache the complete `.output/**`
artifact. There is no separate `runner.mjs`. Relocated artifact checks run Host's
`--check` and exercise the same executable in `--runner --check` mode for Pi.
Real document checks and successful-build-only development restarts remain
unchanged.

## Consequences

Deployment, subprocess launch and artifact verification share one executable
path while retaining a process per Run. Dynamic mode loading keeps child startup
separate from Host composition. The narrower execution port states the Runner's
capabilities directly.

A Host timer can terminate a blocked child after its grace period, including
initialization that never reaches Pi execution. Cleanup must still wait for exit
and use the durable fence; timeout is not permission to replace a completed
result. Process isolation remains fault containment rather than a sandbox for
arbitrary code.

## Follow-up

Revisit process topology only with measured deployment or execution requirements
and equivalent credential, failure and lifecycle isolation. Arbitrary code or
browser/GUI execution still requires the execution driver and security sandbox
described in ADR-0017.
