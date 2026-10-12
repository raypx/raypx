# @voidmix/cache

## Purpose

The server-side Redis cache adapter shared by API runtimes. It provides a
JSON `remember` operation and Better Auth secondary-storage compatibility.

## Interface

| Path    | Purpose                                                                |
| ------- | ---------------------------------------------------------------------- |
| `.`     | Cache facade, Redis factory, and Better Auth secondary-storage adapter |
| `./env` | Redis cache environment preset                                         |

## Ownership

- Own Redis connection options, key namespaces, serialization, TTL behavior,
  atomic cache operations, and Redis lifecycle.
- Own no authentication policy or application settings semantics.
- Never provide an in-memory or file fallback when Redis is unavailable.

## Constraints

- TTL values are integer seconds; omitted TTL means no expiry.
- Generic cache values are JSON-serialized and restore plain objects, arrays,
  primitives, and null. The generic type parameter does not revive Date, class
  instances, Map, Set, or custom prototypes; callers should encode those values
  explicitly. Better Auth values use raw strings.
- Owned ioredis connections require RESP3 with native reply mapping. New Redis
  commands must model their RESP3 return shape at the `RedisClientLike` boundary.
- `getAndDelete` and secondary-storage `increment` retain Redis atomicity.
- Generic cache and Better Auth keys have separate namespaces. `remember` does
  not lock resolvers; simultaneous misses can resolve independently.
- Redis errors are propagated to callers.
- Failed owned connections are explicitly disconnected so their retry timers
  cannot keep a host alive. Owned clients consume raw error events; callers
  report sanitized metadata through their application logger.

## Verification

```bash
bun run --cwd packages/cache check
bun run --cwd packages/cache test
```
