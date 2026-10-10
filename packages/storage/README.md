# @raypx/storage

Server-side memory, filesystem, and Redis storage using unstorage. Importing
this package creates no storage driver, Redis connection, or directory.
Applications create only the resources their enabled features need.

## Explicit instance ownership

Use the public root export for new application code:

```typescript
import { createStorageInstance } from "@raypx/storage";

const storage = createStorageInstance({ memory: true });
try {
  await storage.setItem("example", { enabled: true });
  const value = await storage.getItem("example");
} finally {
  await storage.dispose();
}
```

`createStorageInstance(config?: StorageConfig): Storage` creates a fresh driver
on every call. It reads neither `NODE_ENV` nor `REDIS_URL`; the application
supplies validated configuration. The returned unstorage instance works
directly with `createCache` and supports namespacing through unstorage's
`prefixStorage`.

Explicit driver precedence is:

1. `memory: true` selects memory, regardless of other options.
2. A nonempty `redis` URL selects Redis with `lazyConnect: true`.
3. Otherwise, `fsBase` selects filesystem; the default is `./data/cache`.

`memory: false` does not let `NODE_ENV=test` override explicit Redis or
filesystem configuration. Filesystem paths are relative to the current cwd.
Independent instances have separate driver ownership; instances targeting
the same filesystem base or Redis backend still share persisted data.

```typescript
const files = createStorageInstance({ fsBase: "/var/lib/my-app/cache" });
const redis = createStorageInstance({ redis: "redis://localhost:6379" });
```

Filesystem directories are created by writes. Redis connects on the first
Redis operation. Importing or creating an unused lazy Redis driver does not
perform a connection check.

The application owns `storage.dispose()`. Repeated and concurrent calls share
one disposal promise and invoke the underlying cleanup once. A cleanup failure
remains a rejected disposal promise; repeating disposal does not retry it.
Stop using an instance after disposal. When an application activates storage,
register that instance's disposer with its runtime lifecycle:

```typescript
runtime.register({ name: "cache", dispose: () => storage.dispose() });
```

This package does not initialize storage for the web application automatically.

## Validated feature caches

`createCache` is available from `@raypx/storage/cache` and the root export.
It accepts an explicitly owned `storage`, a namespace, and a structural
`schema.parse` validator supplied by the feature:

```typescript
import { createCache, createStorageInstance } from "@raypx/storage";
import { z } from "zod";

const storage = createStorageInstance({ memory: true });
const cache = createCache({
  storage,
  namespace: "examples",
  schema: z.object({ enabled: z.boolean() }),
});
try {
  const result = await cache.getOrSet("settings", 60, () => ({ enabled: true }));
  await cache.invalidate("settings");
} finally {
  await storage.dispose();
}
```

Declare the validator dependency in the consuming application. Both fresh and
persisted values are validated. Invalid persisted values become misses;
loader failures propagate and can be retried. Storage-driver failures return
fresh validated results. TTLs must be positive and at most one year; values
must be JSON-serializable.

`getOrSet` coalesces concurrent misses within one cache instance, with a bounded
in-flight map. Multiple replicas need a separate coordination policy.
`invalidate(key)` and `clear()` prevent pending loads from repopulating stale
data; already-running callers may still receive their loaded result. Clear is
scoped to the declared namespace. A failed invalidation or clear bypasses that
cache instance until it is recreated.

## Compatibility singleton

Existing `getStorage(config?)` consumers retain the original defaults. The first
call chooses the driver and subsequent calls reuse it until `closeStorage()`:

1. `config.memory: true` or `NODE_ENV=test` selects memory. Even an explicit
   `memory: false` does not override this compatibility test default.
2. Otherwise, a nonempty `config.redis` takes precedence over `REDIS_URL`.
3. Otherwise, a nonempty `config.fsBase` takes precedence over `./data/cache`.

`closeStorage()` disposes only the compatibility singleton and allows a later
fresh initialization. It does not close independently created instances.

The existing helpers remain available:

| Export                               | Behavior                                        |
| ------------------------------------ | ----------------------------------------------- |
| `createNamespacedStorage(namespace)` | Prefixes keys on the compatibility singleton    |
| `cache(key, ttl, load)`              | Compatibility TTL helper without a value schema |
| `invalidate(pattern)`                | Removes matching singleton keys; supports `*`   |
| `clearAll()`                         | Clears all data on the singleton                |

Prefer `createCache` for external or persisted values requiring validation.
Use instance-level namespace clearing instead of `clearAll()` when unrelated
features share a backend.

## Verification

From the repository root:

```bash
bun --cwd packages/storage run vp test run
bun run vp exec tsc --noEmit -p packages/storage/tsconfig.json
bun run vp exec tsc -p packages/storage/tsconfig.test.json
```

Tests cover independent memory and cache instances, concurrent disposal,
filesystem persistence under `NODE_ENV=test`, explicit lazy Redis selection,
and compatibility configuration and lifecycle behavior. No Redis server is
required by these tests.
