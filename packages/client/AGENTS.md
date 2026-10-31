# @raypx/client

## Purpose

The browser/native-safe remote API SDK.

## Interface

`.` exports createApiClient, createTaskClient, their client types, RelayConnection
and injectable fetch/socket types. `RelayScheduler` and `systemRelayScheduler` expose a browser-safe
clock, timer cancellation and random source; RelayConnection accepts one optional scheduler
for deterministic retry and heartbeat tests, retaining system defaults at runtime. Task mutations use the relay; HTTP reads retain
the existing projection contracts. Relay traffic contains no credentials in URLs.
Task subscriptions carry typed device/event/reset changes. Relay requires v3 for
managed tasks and observed requests. Unsupported versions stop with UPGRADE_REQUIRED;
there is no downgrade or missing-procedure fallback. New account attachment explicitly
restarts a rejected connection after the server is upgraded.

## Ownership

The browser/native-safe remote API SDK.

## Constraints

Use public contracts/api and Core domain entries. Reconnect replays events by cursor; never
automatically retry a sent execution command. Fetch credentials and headers for every request. Use POST without automatic retry, compression or batching. No filesystem, SQLite, PTY, environment or database imports.

## Verification

```sh
bun run --cwd packages/client check
bun run --cwd packages/client test
```

`createApiClient().configuration` exposes the typed site-settings RPCs. TaskClient
selects only the account/coordination contracts, excluding administrator settings.

`TaskClient.observed` reads bounded summaries and individual request bodies, and sends
receipt-bound decisions over relay v3. Never automatically retry a changed decision.
