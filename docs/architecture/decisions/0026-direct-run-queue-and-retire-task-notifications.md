# ADR-0026: Direct Run queue and retirement of task notifications

## Status

Accepted, October 13, 2026.

Supersedes the outbox dispatch and task-notification provisions of
[ADR-0016](0016-cloud-agent-platform.md), the notification/outbox retention in
[ADR-0019](0019-retire-legacy-desktop-execution.md) and
[ADR-0021](0021-retire-admin.md), and Host dispatch responsibilities in
[ADR-0025](0025-worker-single-entry-execution.md). Refines queue admission under
[ADR-0017](0017-gateway-and-task-rounds.md); its execution fences, grants, immutable
rounds and authorization remain in force.

## Context

Task notifications are outside the current product scope. Their station inbox,
read state, preferences, typed emails and Worker delivery loop add a second
delivery protocol. The outbox also translates a committed queued Run into a
dispatch-ready Run, even though the Run already has durable status, an atomic
claim and an expiring execution lease.

## Decision

The canonical CloudRun is the durable work queue. Application commits a queued
Run together with its Turn, TaskRound, idempotency record and quota admission
facts. Worker polls queued Runs directly and atomically claims each Run before
starting its isolated Runner. No outbox event, acceptance callback or
`dispatchReady` gate is required. Existing queued Runs remain eligible without
backfilling old outbox records or readiness values.

Keep current account/project authorization, cancellation, quota checks, unique
active Task Runs, owner epochs, the 30-second lease, ten-second renewal,
expired-owner recovery and private execution grants. Failed execution remains a
durable terminal result; automatic side-effect replay is not introduced.
The single Bun executable, isolated task processes, overall deadline and scratch
cleanup from ADR-0025 remain unchanged.

Retire task notifications, their public RPCs/DTOs, client methods, Web inbox and
navigation, notification preferences, task mail templates and Worker delivery
adapters. Retired RPCs use the ordinary missing-route response. Task/Run pages
and their streams continue to expose status, errors, delivery review and usage.
Local Toast feedback remains available. Authentication verification, password
reset and welcome emails retain their existing API-owned configuration and
delivery behavior.

Remove active outbox ports and adapters. Keep stored outbox/notification records,
preference tables, the compatibility dispatch-ready column and every historical
SQL artifact. Their definitions remain schema-local compatibility data, outside
active Core and Contracts interfaces. Do not DROP data, rewrite migration history,
add a migration or send old notifications during deployment.

## Consequences

There is one durable queue and one execution ownership protocol. A committed
queued Run survives an API or Worker restart and is eligible for the next
Worker poll. Multiple hosts can poll the same candidates because the atomic
claim, rather than poll results, assigns ownership. There is no notification
delivery retry loop or task-mail dependency in Worker.

Verification covers direct pickup of fresh and previously queued Runs, concurrent
claims, authorization/cancellation fencing, durable terminal publication, retired
RPC absence and retained authentication emails. Database generation must report
no schema drift because physical compatibility data remains unchanged.

## Follow-up

Reintroduce task notifications only for a concrete product need with explicit
delivery, retry, recipient authorization and data-migration decisions. External
effects requiring durable dispatch need their own delivery design; they must not
silently revive the retired outbox protocol.
