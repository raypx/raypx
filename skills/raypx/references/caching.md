# Server cache

`apps/api/server/cache/` is the API's one application cache, on Node. Full guide: `docs/development/caching.md`.

- Store: Redis/Valkey when `REDIS_URL` is set (Node only, shared by processes) behind a
  one-second process-local copy (`cache/tiered.ts`); otherwise a bounded memory store
  per Node process.
- `createRuntime` builds it once and exposes `runtime.cache`; `RuntimeProviders.cache`
  overrides it.
- `cache.getOrLoad(key, { ttlMs, parse }, load)` serves a copy, shares concurrent loads,
  never stores failures. `set`/`delete` after writes supersede in-flight loads.
- Values are JSON and re-validated by `parse`; bad entries and store outages are misses.
- Site configuration's `readCached()` uses it with a 5-second TTL; registration and
  admin paths still read PostgreSQL.

Rules: cache only data with a loader, keep authoritative checks on the source, prefix
keys with the feature name, and never cache credentials, tokens or private file content.
Without Redis, invalidation reaches only the handling process; choose TTLs accordingly.
