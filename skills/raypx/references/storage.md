# Object storage

`@raypx/storage` (universal library) wraps unstorage drivers in `ObjectStorage`:
`put`, `get` (bytes or null), `getStream`, `has`, `delete`, `list(prefix)` and
`signedUrl(key, { method, expiresIn, contentType })`. Guide: `docs/development/object-storage.md`.

- `@raypx/storage/s3` → `createS3Storage({ endpoint, region, bucket, accessKeyId, secretAccessKey })`
  for AWS S3 and compatible services on Node; path-style URLs; pre-signing through aws4fetch.
- API: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (all or none)
  and `S3_REGION` (default `auto`) build `runtime.storage`; otherwise operations fail
  with `STORAGE_NOT_CONFIGURED`. `RuntimeProviders.storage` injects another store.
- Tests: `createMemoryStorage()` (no signer).
- Keys: `/`-separated `A-Z a-z 0-9 ! - _ . * ' ( )` segments, no `.`/`..`, max 1024.
- Errors: `StorageError` codes only; never surface driver messages, URLs or content.

Not present yet: upload/download routes, size/type policy, object records in PostgreSQL,
local filesystem storage. Consumers own authorization for every key.
