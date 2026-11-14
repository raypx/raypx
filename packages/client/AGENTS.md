# @raypx/client

## Purpose

The browser/native-safe remote API SDK. New Agents clients consume `/api`; the
retained device-task `/tasks` entry has only runtime acceptance consumers after the device-task
client removal and records its later removal through `raypx.entryConsumers`.

## Interface

There is no root entry. `/api` exports createApiClient, its client and header types,
the injectable `FetchCallable` and isMissingProcedure. `/relay` exports RelayConnection,
relayUrl and the injectable `RelaySocketFactory`, plus `RelayScheduler` and `systemRelayScheduler`, which expose a
browser-safe clock, timer cancellation and random source; RelayConnection accepts one optional
scheduler for deterministic retry and heartbeat tests, retaining system defaults at runtime.
`/relay` also exports the transport-independent AcknowledgedStream and StreamCursor.
One exact ACK advances a cursor; injected deadlines, aborts and resets cancel
pending delivery. API and CLI share this primitive; CLI adapts its local errors.
Each socket attempt owns an AbortSignal, passed to authenticate/message and as the
third status argument. Close/replacement aborts it before reporting disconnection;
automatic reconnect creates a new scope. Consumers must scope pending work and
outgoing responses to that signal. Stop also cancels the retry lifetime.
`/tasks` exports createTaskClient and TaskClient. Import relay, task-change and command frame
types from `@raypx/contracts/tasks` directly; the client does not re-export them.
Task mutations use the relay; HTTP reads retain
the existing projection contracts. Relay traffic contains no credentials in URLs.
Task subscriptions carry typed device/event/reset changes. Relay requires v5 for
managed tasks and observed requests. Unsupported versions stop with UPGRADE_REQUIRED;
there is no downgrade or missing-procedure fallback. New account attachment explicitly
restarts a rejected connection after the server is upgraded.

## Ownership

The browser/native-safe remote API SDK.

## Constraints

Use public contracts/api and Core domain entries. Reconnect replays events by cursor; never
automatically retry a sent execution command. Fetch credentials and headers for every request. Use POST without automatic retry, compression or batching. No filesystem, SQLite, PTY, environment or database imports.

## Verification

Relay scheduler tests use the shared fixtures from `@raypx/testing`.

```sh
bun run --cwd packages/client check
bun run --cwd packages/client test
```

A sign-in or account feature imports `/api` only, so the authentication bundle never
carries relay scheduling.

`createApiClient().configuration` exposes the typed site-settings RPCs. TaskClient
selects only the account/coordination contracts, excluding administrator settings.
Its approvals type selects only the retained device `list` projection; new Computer
approval procedures are consumed through `/api`.

`TaskClient.observed` reads bounded summaries and individual request bodies, and sends
receipt-bound decisions over relay v5. Never automatically retry a changed decision.
