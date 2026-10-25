# @raypx/client

## Purpose

The browser/native-safe remote API SDK.

## Interface

`.` exports createApiClient, createTaskClient, their client types, RelayConnection
and injectable fetch/socket types. Task mutations use the relay; HTTP reads retain
the existing projection contracts. Relay traffic contains no credentials in URLs.
Task subscriptions carry typed device/event/reset changes. Relay v3 carries observed requests; managed-only v2 remains compatible. Unsupported versions stop
reconnection with UPGRADE_REQUIRED. Incremental activities require their exact baseline;
consumers recover missing revisions from the task checkpoint.

## Ownership

The browser/native-safe remote API SDK.

## Constraints

Use only the public contracts/api entry. Reconnect replays events by cursor; never
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
