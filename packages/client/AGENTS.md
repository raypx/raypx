# @raypx/client

## Purpose

The browser/native-safe remote API SDK.

## Interface

`.` exports createApiClient, createTaskClient, their client types, RelayConnection
and injectable fetch/socket types. Task mutations use the relay; HTTP reads retain
the existing projection contracts. Relay traffic contains no credentials in URLs.

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
