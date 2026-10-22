# Server caching

`apps/api/server/cache/` gives API features one cache that behaves the same on Node
and Cloudflare Workers. It is an optimization only: every cached value must also be
loadable from its source of truth, and authoritative decisions read that source.

## Stores

| Runtime             | Store                            | Scope                       |
| ------------------- | -------------------------------- | --------------------------- |
| Node with REDIS_URL | Memory in front of Redis/Valkey  | Shared by every API process |
| Node without Redis  | Memory (`cache/memory.ts`)       | One process                 |
| Cloudflare Workers  | Memory, created once per isolate | One isolate                 |

`CacheStore` is the raw port: string values with a millisecond TTL. The memory store
is bounded (1000 entries, least recently used evicted first). Workers do not use KV:
its 60-second minimum TTL and eventual consistency do not fit short-lived settings.

With Redis, `cache/tiered.ts` keeps a process-local copy of each value for up to one
second (`NEAR_CACHE_TTL_MS` in `runtime/adapters.ts`) in front of Redis. Hot keys skip
the network, and a Redis outage costs one failed read per key per second instead of
one per request. Changes saved by another process apply here within that second.

## Using the cache

`createRuntime` builds one `Cache` and exposes it as `runtime.cache`. Pass it to
feature services instead of creating private holders:

```ts
const profile = await cache.getOrLoad(
  `public-profile:${userId}`,
  { ttlMs: 30_000, parse: (value) => publicProfileSchema.parse(value) },
  () => repository.readPublicProfile(userId),
);
// After a write, store the saved value (or delete the key).
await cache.set(`public-profile:${userId}`, saved, 30_000);
```

- Values are JSON. Every read is parsed by the caller's schema, so a stale shape or a
  corrupted entry becomes a miss, and callers always receive their own copy.
- Concurrent misses in one process share a load. Failed loads are never stored.
  A `set`/`delete` supersedes loads already in flight.
- Store outages degrade to misses and dropped writes; requests still reach the loader.
- Keys live under `cache:` (Redis adds its `raypx:` prefix). Prefix keys with the
  feature name and never put credentials, tokens or private file content in keys or
  values.

Invalidation reaches every process only with Redis, within the one-second local copy.
Without it, other processes and isolates see changes once their TTL expires, so keep
TTLs to what the feature can tolerate. Site configuration uses this cache for `readCached()` with a 5-second TTL.
