# @raypx/client

## Purpose

The browser/native-safe remote API SDK.

## Interface

`.` exports createApiClient, ApiClient and injectable header/fetch types.

## Ownership

The browser/native-safe remote API SDK.

## Constraints

Use only the public contracts/api entry. Fetch credentials and headers for every request. Use POST without automatic retry, compression or batching. No filesystem, SQLite, PTY, environment or database imports.

## Verification

```sh
bun run --cwd packages/client check
bun run --cwd packages/client test
```
