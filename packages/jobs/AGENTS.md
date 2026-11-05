# @raypx/jobs

## Purpose

Browser views for shared local/cloud jobs. Pure models live in `@raypx/jobs-model`;
cloud scheduling use cases live in `@raypx/jobs-server`.

## Interface

`/client` owns DOM views and their injected ports; apps own routing, authentication and concrete adapters.
Recurring platform timers belong to apps; dispatch deadlines remain bounded within the use case.

## Boundaries

Contracts imports `@raypx/jobs-model` to assemble wire messages; jobs must never import
contracts or a concrete SDK. Keep the complete dependency graph acyclic.
Cloud actions are device.sync and agent.run, scoped to an account and captured
device epoch. Local directory scans/commands retain their device ownership and
wire format. No server action may execute arbitrary shell commands.

Persist occurrence and run IDs before dispatch. A task's acknowledgement is not
completion: keep overlap protection until its projection reaches a terminal state.
Unknown delivery pauses the plan and is never automatically resent. Freshness,
actual execution and approval remain with the device owner/harness.
Creation requests retain their UUID until confirmed; timeout retries cannot create
two schedules. Manual runs retain a separate immutable request/run ID. The remote
task ID equals its run ID for the existing host command receipt protocol.

Client views receive independent ports, never SDK-derived Pick types. Private state
is remounted and in-flight requests aborted on account/client changes. Keep local
automations in the Desktop device profile; login does not migrate them.
Local definitions accept an optional projectId. New project forms default it to
the current project; existing unassigned plans remain in global management. Cloud
forms retain edits on CAS errors and require explicit device epoch reselection.

## Verification

Run package checks/tests and both application consumers. SQL persistence, actual
relay round trips and Node/Nitro scheduled events have separate integration gates.
