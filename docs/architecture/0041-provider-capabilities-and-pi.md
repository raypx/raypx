# ADR 0041: Provider capabilities and managed Pi

Status: Accepted, 2026-11-03. Extends ADR 0040. Amended 2026-11-04: provider workspaces
consolidated into `@raypx/providers`.

Implementation amendments: [ADR 0044](0044-event-sourced-cli-orchestration.md)
adds durable orchestration effect intents; [ADR 0045](0045-tauri-node-pnpm.md)
moves the execution runtime from Bun to Node without changing provider scope.

## Ownership and capabilities

AgentTask remains the sole Run lifecycle. The CLI daemon owns execution, project locks,
approval arbitration, credentials and ProfileStorage. SDK sessions use the same private
harness as external processes. Codex, Claude and Pi publish versioned definitions for
runtime kind, modes, approvals and model selection; discovery separately reports
availability and effective input modes. Unsupported operations fail at the execution
boundary. Terminal connectors cover Codex and Claude only.

`@raypx/providers/pi` owns the bounded SDK loop, normalized activity and injected session
adapter; `./pi/context` owns the stored transcript schema. `@raypx/ai` owns transport,
model lookup, offline auth configuration checks and public SDK context
conversion/estimation. CLI owns TOML, OS tools and SQLite. The library's test-only
`tests/helpers` supply common host/transport scenarios and conformance suites; runtime
entries never import them.

This borrows T3's adapter capabilities, conformance tests and distinction between
replayable state and process-bound effects. It preserves Raypx's TypeScript,
SQLite and existing task coordinator. `ExecutionEffects` remains the lifecycle
callback interface; ADR 0044 adds the durable effect-intent store around execution.
The reference is the local t3code checkout at commit
47f2c8d29e981c7723467efe137ee19e91df924e; its Pi CLI/RPC transport is different.

## Models and local execution

Desktop and public task commands expose Pi on the registered device profile. Remote
announcements mark Pi unavailable and omit it from project provider grants. The execution
kernel rejects remote Pi starts. Web remote Pi and mobile controls are later work.

Model references distinguish the execution driver from the AI provider and include a
non-secret connection fingerprint. A Run's model is immutable. Explicit creation
selection overrides the profile default, then TOML. A follow-up retains its conversation
model unless explicitly changed. A selected invalid model fails rather than falling back.
Device defaults are profile metadata; CLI never rewrites user TOML. Keys come from the
host environment. Keyless custom endpoints never borrow another provider's headers.

Only terminal Run boundaries permit model changes. Continuing requires the current
context revision and latest owner Run. Crossing connections additionally requires
confirmation bound to that revision and destination. Store canonical history; convert
only request input through the public SDK. Reject unsupported images and estimated
context overflow before dispatch. Catalog status means configured, not remotely verified.

## Tools, durability and recovery

Plan exposes list/stat/read only. Run adds version-checked write/mkdir/move/delete and
exec-form commands. Every mutation/command has its own exact approval; operations
recheck grants, traversal/symlinks and file versions. External commands retain OS
permissions. Commands have a ten-minute maximum.

Persist applied approval before resolving its waiter, effect intent before an operation,
and outcome before further inference. An uncertain effect never replays. Cancellation
waits for SDK, tools, persistence and callbacks to drain before releasing ownership.
Pi queues input and does not advertise active steering.

Formal Pi contexts have a versioned identity in the existing bounded transcript table.
No experimental context is auto-imported. Lost-owner inference can resume committed
safe history only through a deliberate follow-up. Unresolved effects block continuation;
inspect them and explicitly start a new session. Clearing finished history removes
unreferenced formal contexts atomically; logout preserves local preferences/history.

Each Run defaults to eight model requests, with a hard maximum of 32. Active execution
is bounded to ten minutes. Human approval waiting pauses that budget and retains the
existing ten-minute approval expiry. Model calls retain their separately configured
timeout, one request attempt and caller cancellation.

## Public CLI

`raypx tasks` is an explicit command tree, separate from the Jobs-only TUI:
providers, models, projects, configure, create, follow-up, input, list, get, cancel,
watch, approvals list/get/decide, defaults get/set.

Use the existing JSON operand and profile options. The authenticated daemon owns tasks;
finite command exit and watch SIGINT disconnect the client. Explicit cancel drains the
task. Commands may start the daemon, but never install a system service. Reconnect
reads authoritative projections and never automatically replays mutations.
Finite output supports --json; watch emits bounded NDJSON snapshots. --yes cannot
authorize Agent tools or context transfer.

Examples (replace returned IDs and copy model references from tasks models):

```sh
raypx tasks projects --json
raypx tasks models --json
raypx tasks configure '{"rootId":"PROJECT_UUID","providers":["pi"]}' --json
raypx tasks create '{"id":"COMMAND_UUID","projectId":"PROJECT_UUID","provider":"pi","prompt":"Inspect this project","mode":"plan"}' --json
raypx tasks get '{"id":"TASK_UUID"}' --json
raypx tasks approvals list --json
raypx tasks approvals get '{"id":"APPROVAL_UUID","taskId":"TASK_UUID"}' --json
raypx tasks approvals decide '{"commandId":"COMMAND_UUID","id":"APPROVAL_UUID","decision":{"type":"allow"}}' --json
raypx tasks watch '{"id":"TASK_UUID"}'
raypx tasks cancel '{"commandId":"COMMAND_UUID","id":"TASK_UUID"}' --json
```

Create/follow-up/input accept an explicit id; otherwise a new command ID is returned.
Repeat the same ID and payload for receipt recovery. Changed payloads conflict. Follow-up
accepts model and contextRevision; cross-connection requests include contextTransfer
with that revision and the chosen connectionId. A current read projection supplies both.

## Validation and next increments

Shared adapter conformance, SDK fault injection, SQLite recovery, real HTTP model
fixtures, Desktop component checks and daemon-client integration cover this delivery.
Compiled CLI acceptance uses synthetic models and temporary profiles. Live services,
packaged macOS/Windows GUI acceptance and distribution signing are separate gates.

Later increments: read-only Run diff; checkpoint restore with isolated-worktree safety;
Cron-created Agent tasks through the same runtime; then broader client parity.

## Amendment: one providers workspace

2026-11-04. `provider-pi` and `provider-testing` merged into `@raypx/providers` with the
Codex and Claude adapters ([ADR 0040 amendment](0040-instance-enrollment-and-providers.md#amendment-one-providers-workspace)).
The Pi entries keep their Node target, remain the only sources that import the Pi SDK or
`@raypx/ai`, and still pass the shared adapter conformance suites. Remote Pi stays unavailable.
