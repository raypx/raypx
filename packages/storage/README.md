# @raypx/storage

Universal storage layer with **unstorage** + Redis support

## Features

- ✅ **Multiple Drivers** - Redis, Filesystem, Memory
- ✅ **Auto-selection** - Uses best available driver
- ✅ **Namespacing** - Isolated storage contexts
- ✅ **TTL Support** - Automatic expiration
- ✅ **Cache Utilities** - Simple caching helpers
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Logging** - Integrated with @raypx/logger

## Installation

```bash
# Core
bun add unstorage

# Redis (optional)
bun add ioredis
```

## Quick Start

```typescript
import { getStorage } from "@raypx/storage";

const storage = getStorage();

// Set value
await storage.setItem("user:123", { name: "John", email: "john@example.com" });

// Get value
const user = await storage.getItem("user:123");

// Delete value
await storage.removeItem("user:123");
```

## Driver Selection

Storage automatically selects the best driver:

1. **Redis** - If `REDIS_URL` environment variable is set
2. **Filesystem** - Fallback for development
3. **Memory** - For testing (`NODE_ENV=test`)

### Environment Variables

```env
# Production: Use Redis
REDIS_URL=redis://localhost:6379

# Development: Use filesystem (automatic)
# Test: Use memory (automatic with NODE_ENV=test)
```

## Usage Examples

### Basic Operations

```typescript
import { getStorage } from "@raypx/storage";

const storage = getStorage();

// Store data
await storage.setItem("key", { data: "value" });

// Retrieve data
const value = await storage.getItem("key");

// Check existence
const exists = await storage.hasItem("key");

// Remove data
await storage.removeItem("key");

// List keys
const keys = await storage.getKeys("user:*");

// Clear all
await storage.clear();
```

### Namespaced Storage

Isolate storage by namespace:

```typescript
import { createNamespacedStorage } from "@raypx/storage";

const userCache = createNamespacedStorage("users");
const postCache = createNamespacedStorage("posts");

// Keys are automatically prefixed
await userCache.setItem("123", userData); // Stored as "users:123"
await postCache.setItem("456", postData); // Stored as "posts:456"

const user = await userCache.getItem("123"); // Reads "users:123"
```

### Cache with TTL

Simple caching with automatic expiration:

```typescript
import { cache } from "@raypx/storage";
import { getDatabase } from "@raypx/db";
import { users } from "@raypx/db/schema";
import { eq } from "drizzle-orm";

// Cache for 1 hour (3600 seconds)
const user = await cache("user:123", 3600, async () => {
  // This function only runs on cache miss
  const db = getDatabase();
  const [user] = await db.select().from(users).where(eq(users.id, 123));
  return user;
});

// Second call returns cached value (no database query)
const sameUser = await cache("user:123", 3600, async () => {
  // Not executed - cache hit
});
```

### Cache Invalidation

```typescript
import { invalidate } from "@raypx/storage";

// Invalidate single key
await invalidate("user:123");

// Invalidate by pattern
await invalidate("users:*"); // All users
await invalidate("posts:user:123:*"); // All posts by user 123
```

### API Response Caching

```typescript
// apps/web/src/routes/api.users.$userId.ts
import { createFileRoute } from "@tanstack/react-router";
import { cache } from "@raypx/storage";
import { getDatabase } from "@raypx/db";
import { users } from "@raypx/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/users/$userId")({
  server: {
    handlers: {
      async GET({ params }) {
        const userId = parseInt(params.userId);

        // Cache user data for 5 minutes
        const user = await cache(`user:${userId}`, 300, async () => {
          const db = getDatabase();
          const [user] = await db.select().from(users).where(eq(users.id, userId));
          return user;
        });

        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        return Response.json(user);
      },

      async PATCH({ params, request }) {
        const userId = parseInt(params.userId);
        const updates = await request.json();

        // Update database
        const db = getDatabase();
        await db.update(users).set(updates).where(eq(users.id, userId));

        // Invalidate cache
        await invalidate(`user:${userId}`);

        return Response.json({ success: true });
      },
    },
  },
});
```

### Session Storage

```typescript
import { createNamespacedStorage } from "@raypx/storage";

const sessionStorage = createNamespacedStorage("sessions");

// Store session (30 minutes TTL)
export async function createSession(userId: string, data: any) {
  const sessionId = crypto.randomUUID();
  await sessionStorage.setItem(sessionId, {
    userId,
    data,
    expires: Date.now() + 30 * 60 * 1000, // 30 minutes
  });
  return sessionId;
}

// Get session
export async function getSession(sessionId: string) {
  const session = await sessionStorage.getItem(sessionId);

  if (!session) return null;
  if (session.expires < Date.now()) {
    await sessionStorage.removeItem(sessionId);
    return null;
  }

  return session;
}

// Destroy session
export async function destroySession(sessionId: string) {
  await sessionStorage.removeItem(sessionId);
}
```

### Rate Limiting

```typescript
import { getStorage } from "@raypx/storage";

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const storage = getStorage();
  const rateLimitKey = `ratelimit:${key}`;

  const data = await storage.getItem<{ count: number; expires: number }>(rateLimitKey);
  const now = Date.now();

  if (!data || data.expires < now) {
    // New window
    await storage.setItem(rateLimitKey, {
      count: 1,
      expires: now + windowSeconds * 1000,
    });
    return true;
  }

  if (data.count >= maxRequests) {
    // Rate limit exceeded
    return false;
  }

  // Increment counter
  await storage.setItem(rateLimitKey, {
    count: data.count + 1,
    expires: data.expires,
  });

  return true;
}

// Usage in API route
const allowed = await checkRateLimit(`api:${userId}`, 100, 60); // 100 req/min
if (!allowed) {
  return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
}
```

## Redis Setup

### Local Development

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Using Homebrew (macOS)
brew install redis
brew services start redis

# Verify
redis-cli ping  # Should return PONG
```

### Production

```env
# Redis Cloud, AWS ElastiCache, etc.
REDIS_URL=redis://username:password@host:6379
```

### Redis Configuration

```typescript
import { getStorage } from "@raypx/storage";

// Custom configuration
const storage = getStorage({
  redis: "redis://localhost:6379",
});
```

## Testing

Use memory driver for tests:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getStorage, clearAll } from "@raypx/storage";

describe("Storage", () => {
  beforeEach(async () => {
    // Clear before each test
    await clearAll();
  });

  it("should store and retrieve data", async () => {
    const storage = getStorage({ memory: true });

    await storage.setItem("key", { value: "test" });
    const data = await storage.getItem("key");

    expect(data).toEqual({ value: "test" });
  });
});
```

## API Reference

### `getStorage(config?)`

Get or create storage instance.

**Parameters:**

- `config.redis` - Redis URL
- `config.fsBase` - Filesystem base path
- `config.memory` - Use memory driver

**Returns:** Storage instance

### `createNamespacedStorage(namespace)`

Create namespaced storage with automatic key prefixing.

**Parameters:**

- `namespace` - Namespace prefix

**Returns:** Namespaced storage

### `cache<T>(key, ttl, fn)`

Cache function result with TTL.

**Parameters:**

- `key` - Cache key
- `ttl` - Time to live (seconds)
- `fn` - Function to execute on cache miss

**Returns:** Cached or fresh value

### `invalidate(pattern)`

Invalidate cache by key or pattern.

**Parameters:**

- `pattern` - Key or glob pattern (`*` supported)

### `clearAll()`

Clear all cached data.

## Best Practices

1. **Use namespaces** - Isolate different data types
2. **Set appropriate TTLs** - Don't cache forever
3. **Invalidate on updates** - Keep cache fresh
4. **Handle cache misses** - Always have fallback logic
5. **Monitor Redis** - Watch memory usage in production

## Migration from Other Caching

### From in-memory cache

```typescript
// Before
const cache = new Map();
cache.set("key", value);

// After
import { getStorage } from "@raypx/storage";
const storage = getStorage();
await storage.setItem("key", value);
```

### From Redis directly

```typescript
// Before
import Redis from "ioredis";
const redis = new Redis();
await redis.set("key", JSON.stringify(value));

// After
import { getStorage } from "@raypx/storage";
const storage = getStorage();
await storage.setItem("key", value); // Auto-serialization
```

---

**Universal caching for your application** 📦

## Validated feature caches

`createCache` from `@raypx/storage/cache` accepts an explicitly owned storage
driver, namespace, and structural `schema.parse` validator. `getOrSet` provides
TTL and coalesces concurrent misses for the same key within one process.
Invalid persisted values become misses. Failed loaders propagate and can be
retried; storage-driver failures return fresh validated results.

`invalidate(key)` and `clear()` prevent pending loads from writing stale data.
Already-running callers may still receive their loaded result. Clear is scoped
to the declared namespace. A failed invalidation or clear bypasses this cache
instance until it is recreated, so stale persisted entries cannot mask fresh
business data. Request coalescing has a bounded in-flight map and
works within one cache instance; multiple replicas need an external lock or
other coordination policy. Use JSON-serializable values and positive TTLs up
to one year. `closeStorage()` disposes the compatibility singleton driver once
and permits explicit reinitialization. Register it with the application
lifecycle when activating a storage-backed feature.
