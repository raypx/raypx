# @raypx/storage

## Purpose

Object storage for server runtimes on top of unstorage, with S3 pre-signed URLs.

## Interface

`.`: `ObjectStorage` (put/get/getStream/has/delete/list/signedUrl), `createObjectStorage`
over any raw-capable unstorage driver, `createMemoryStorage` for tests,
`createUnavailableStorage` and `StorageError`. `/s3`: `createS3Storage` for AWS S3,
other S3-compatible providers through fetch and aws4fetch on Bun.

## Constraints

- Keys are `/`-separated segments of `A-Z a-z 0-9 ! - _ . * ' ( )`, at most 1024 chars,
  with no empty, `.` or `..` segments; `assertObjectKey` enforces it on every call.
- Errors carry codes only (`STORAGE_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE`,
  `STORAGE_SIGNING_UNSUPPORTED`, `INVALID_OBJECT_KEY`, `INVALID_INPUT`); never expose
  driver messages, bucket URLs, credentials or object content.
- Pass aws4fetch to the unstorage S3 driver explicitly; this avoids relying on its dynamic runtime import. Requests are path-style. Pre-signed URLs last 1 s to 7 days and
  bind PUT Content-Type when given.
- The unstorage S3 driver buffers whole objects, so `getStream` is not a true stream
  and `list` loads every key under the prefix. Use pre-signed URLs for large objects
  and always list below a narrow prefix.
- No HTTP routes, database records or ownership policy here; the consuming app decides
  who may read or write a key. Add drivers only for an actual deployment target.

## Verification

```sh
bun run --cwd packages/storage check
bun run --cwd packages/storage test
```

Tests use the memory driver and a stubbed S3 endpoint; no bucket is needed.
