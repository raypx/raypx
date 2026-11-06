# ADR 0044: Event-sourced CLI orchestration

Status: Accepted, 2026-11-03. Extends ADR 0042.

## Direction

The CLI Agent host records orchestration as domain events. A pure decider turns
commands plus live-process facts into events and effects; one sink commits the
command receipt, the events, the task/request/input/activity projections, the
relay journal and outbox, and the effect intents in a single SQLite transaction.
A wire projection keeps the existing `AgentEvent` sequence, so relay, Desktop,
replay, snapshot and compaction formats do not change.

This supersedes ADR 0042's "retain existing transaction boundaries" sentence.
That sentence meant each record family kept the boundaries it already had; the
boundary now spans the whole decision, not each writer. It does not change the
providers, adapters, IPC or relay protocol.

## Layer

`apps/cli/src/runtime/agents/domain/` is private to the CLI and depends only on
`@raypx/core/*`, `zod` and other domain files. Tooling's source-layer policy
enforces that with an `orchestration-domain` layer, so a domain file cannot reach
SQLite, Drizzle, contracts, providers or the runtime composition root.

| Concern           | Owner                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Orchestrator      | `decide(state, command, facts)` in `decider.ts`                               |
| Projection store  | task, activity, request and receipt tables, written only by `projector.apply` |
| Wire projection   | `wire.ts`: event plus before/after state to today's `AgentEvent`              |
| Event sink        | `infrastructure/store/sink.ts` `commit()`                                     |
| Effect worker     | `ExecutionCoordinator`; effect results return as commands                     |
| Provider ingestor | `application/ingest.ts`; replaces adapter and recorder store writes           |

## Events

`events.ts` declares CLI-private zod schemas: `task.accepted`,
`task.statusChanged`, `task.sessionBound`, `task.modeChanged`,
`task.tokenUsage`, `request.opened`, `request.decided`, `request.applied`,
`request.expired`, `input.queued`, `input.statusChanged` and `activity.recorded`.

`activity.recorded` is projected and journaled but is not stored in
`task_events`. The activity table is already the latest projection Desktop reads;
keeping a second copy would double Desktop history for no protocol gain.

## Determinism

`domain/ports.ts` defines `Clock` and `Ids`. Application and harness code no longer
call `new Date()` or `crypto.randomUUID()` inline; production injects the system
clock and random UUIDs, and tests inject a fixed clock and monotonic ids.
Live-process facts are inputs, not hidden reads: whether a request is still
pending, whether the session is ready, the queue depth and the closing flag are
passed into the decider. A synchronous `bun:sqlite` transaction stands in for a
per-thread lock, because one process owns the profile writer.

## Effects

Effects are `execution.start`, `execution.cancel`, `provider.request.respond` and
`provider.input.deliver`. They are process-bound: a crash never replays an
effect, because the provider process it addressed is gone. The sink records each
intent in `task_effects` before the worker runs it, so a startup sweep can mark
unfinished effects `abandoned` and emit `HOST_RESTARTED` for active tasks instead
of guessing their outcome.

Approvals apply before the provider hears the answer: the decision commits
`request.applied` with the respond effect, and only then does the worker resolve
the adapter's approval promise. A failed commit leaves the request pending.

Cancellation commits `cancelling` with the cancel effect; the worker kills the
process, drains its streams and releases the project lock; the drained result
commits the terminal status. This keeps today's unlock-then-status order.

## Wire compatibility

Journal rows, compaction, outbox and acknowledgement, relay replay, snapshots,
`streamId` and the `AgentEvent` discriminant union are unchanged. The journal is
a projection of domain events, so the golden tests in
`tests/integration/runtime/agents/orchestration.test.ts` pin the exact event
sequence for approvals, expiry, cancellation, steer and queue, plan approval on
both providers, restart and both bindings. Local Desktop bindings still skip the
activity journal and keep activity only in its latest projection.

## Storage

Step 5 adds `task_effects` and `task_events` with their indexes in a second
migration. It creates tables only; no backfill. Tasks created before the migration
stay projection-only, and their records remain readable. Folding a task's events
reconstructs its task, request and input records, which an oracle test checks for
tasks created after the migration. Clearing history deletes effect and event rows
for forgotten tasks, and settled effects older than seven days are pruned at
startup.

## Risks

- Commit-path throughput: `perf:tasks` guards the streaming snapshot cost.
- Reentrancy: fencing inside `ManagedExecution.serial` stays the turn boundary.
- Event ordering drift: goldens fail on any change to the recorded sequence.
- Version skew: a daemon from before the migration lacks the new tables; Desktop
  ships a matched daemon and `daemon restart` applies it.
