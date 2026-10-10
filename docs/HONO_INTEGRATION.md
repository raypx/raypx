# Historical Hono Integration Proposal

This document records an earlier Hono integration direction, not the current implementation. The `hc`, `apiClient`, and `getUsers` examples below are historical and are not available exports. The former `api-client` workspace is now `@raypx/client`, with business React hooks in `@raypx/client/react`; component behavior belongs in `@raypx/ui/hooks`. Current HTTP uses validated JSON functions and Start route adapters. See [architecture](../ARCHITECTURE.md) and [working examples](../EXAMPLES.md).

## What Changed

### Added Hono API Framework

**New Dependencies:**

- `hono` - Fast web framework
- `@hono/zod-validator` - Zod validation middleware

**New Files:**

- `apps/web/server/api/index.ts` - Main API router
- `apps/web/server/api/routes/users.ts` - User routes
- `apps/web/src/routes/api.$.ts` - TanStack Start integration
- Updated `packages/api-client/` - Type-safe client with `hc`

## Architecture

```
┌─────────────────────────────────────┐
│      React Components               │
└──────────┬──────────────────────────┘
           │ import
           ▼
┌─────────────────────────────────────┐
│   @raypx/api-client                 │
│   Type-safe Hono client (hc)        │
└──────────┬──────────────────────────┘
           │ HTTP Request
           ▼
┌─────────────────────────────────────┐
│   TanStack Start Route              │
│   /api/$ → Mounts Hono              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│   Hono API Router                   │
│   - /health                         │
│   - /users                          │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│   Business Logic                    │
│   @raypx/db, @raypx/auth            │
└─────────────────────────────────────┘
```

## Usage

### Server Side

```typescript
// apps/web/server/api/routes/users.ts
export const userRoutes = new Hono().get("/", async (c) => {
  const users = await db.select().from(users);
  return c.json(users);
});
```

### Client Side

```typescript
// Anywhere in your React app
import { apiClient, getUsers } from "@raypx/api-client";

// Method 1: Direct client
const res = await apiClient.users.$get();
const users = await res.json(); // Fully typed!

// Method 2: Helper function
const users = await getUsers(); // Also fully typed!
```

## Benefits

✅ **End-to-end type safety** - Types flow from server to client
✅ **No code generation** - Types inferred automatically
✅ **REST semantics** - Standard HTTP methods
✅ **Progressive** - Add routes incrementally
✅ **Lightweight** - Hono is tiny and fast

## Next Steps

1. **Add more routes** - Create files in `apps/web/server/api/routes/`
2. **Add validation** - Use `@hono/zod-validator`
3. **Add middleware** - Authentication, rate limiting, etc.
4. **Update tests** - Test the new API routes

## Migration Path

**Old pattern (simple routes):**

```typescript
// Keep for simple routes
apps / web / src / routes / api.health.ts;
```

**New pattern (complex routes):**

```typescript
// Use Hono for complex APIs
apps / web / server / api / routes / users.ts;
```

Both patterns can coexist!

---

**Type-safe REST APIs with Hono** 🎯
