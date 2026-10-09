# API Architecture Decision: oRPC vs Hono HC vs Nitro

## Current State

**Current Stack:**
- TanStack Start (file-based routing)
- Zod for validation
- Manual API client
- Simple health check endpoint

**Question:** Should we add oRPC, Hono hc, or use Nitro for API splitting?

---

## Option 1: oRPC (Type-safe RPC) ⭐

### What is oRPC?

End-to-end type-safe RPC framework, similar to tRPC.

**Architecture:**
```typescript
// Server
import { createRouter } from 'orpc';

const userRouter = createRouter()
  .query('getUser', {
    input: z.object({ id: z.string() }),
    resolve: async ({ input }) => {
      return db.select().from(users).where(eq(users.id, input.id));
    },
  });

// Client (auto-typed)
const user = await client.user.getUser({ id: '123' }); // Fully typed!
```

### Pros
- ✅ **End-to-end type safety** - No manual typing
- ✅ **No code generation** - Types flow naturally
- ✅ **Better DX** - Auto-complete everywhere
- ✅ **Less boilerplate** - No manual client code
- ✅ **Zod integration** - Already using it

### Cons
- ❌ **New dependency** - Another abstraction layer
- ❌ **Learning curve** - Different mental model
- ❌ **Less REST-ful** - RPC style, not REST
- ❌ **Coupling** - Client depends on server types

### Best For
- Internal APIs
- Monorepo apps
- Type-safety fanatics
- Apps where client/server are tightly coupled

---

## Option 2: Hono + hc (HTTP Client) ⭐⭐

### What is Hono hc?

Type-safe HTTP client for Hono APIs.

**Architecture:**
```typescript
// Server (Hono)
import { Hono } from 'hono';

const app = new Hono()
  .get('/users/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ id, name: 'John' });
  });

export type AppType = typeof app;

// Client (hc)
import { hc } from 'hono/client';
import type { AppType } from './server';

const client = hc<AppType>('/api');
const res = await client.users[':id'].$get({ param: { id: '123' } });
const data = await res.json(); // Typed!
```

### Pros
- ✅ **Type-safe REST** - Keeps REST semantics
- ✅ **Lightweight** - Hono is fast
- ✅ **Standard HTTP** - Uses fetch, standard methods
- ✅ **Flexible** - Can still call from non-TS clients
- ✅ **Modern** - Great DX, simple API

### Cons
- ⚠️ **Replaces TanStack Start routing** - Need migration
- ⚠️ **Less integrated** - Not built for TanStack Start
- ⚠️ **Extra setup** - Need to export types carefully

### Best For
- REST APIs
- Public APIs
- Mixed client types (mobile, web)
- When you want standard HTTP

---

## Option 3: Nitro API Splitting 🔧

### What is Nitro?

Universal server toolkit (already used by TanStack Start).

**Architecture:**
```typescript
// Current: All in TanStack Start routes
apps/web/src/routes/api.*.ts

// Option A: Nitro split
apps/
├── web/              # Frontend
└── api/              # Separate Nitro API
    ├── routes/
    │   ├── users/[id].ts
    │   └── health.ts
    └── nitro.config.ts

// Option B: Nitro handlers in same app
apps/web/
├── src/routes/       # Frontend routes
└── server/
    └── api/          # Nitro API handlers
```

### Pros
- ✅ **Already using it** - TanStack Start uses Nitro
- ✅ **Separation** - Clear API/frontend split
- ✅ **Scalability** - Can deploy API separately
- ✅ **Auto-imports** - Nitro's magic imports
- ✅ **Flexibility** - Can use any client library

### Cons
- ⚠️ **Deployment complexity** - Two apps to deploy
- ⚠️ **CORS** - Need to handle cross-origin
- ⚠️ **Type sharing** - Manual type exports
- ⚠️ **Overhead** - Might be overkill for template

### Best For
- Microservices
- Separate API/frontend teams
- When API scales independently
- Multiple frontend consumers

---

## Comparison Matrix

| Aspect | oRPC | Hono hc | Nitro Split | Current (TanStack) |
|--------|------|---------|-------------|-------------------|
| **Type Safety** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Setup Complexity** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **REST Semantics** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **DX** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Scalability** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Public API** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Learning Curve** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Deployment** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## Recommendation for Raypx Template

### Primary Recommendation: Hybrid Approach ⭐

**Keep TanStack Start + Add Hono hc for complex APIs**

```
packages/
├── api/              # Current: business logic
├── api-client/       # Enhanced with hc
└── contracts/        # Zod schemas (keep)

apps/web/src/
├── routes/           # Simple routes stay here
│   └── api.health.ts
└── server/
    └── api/          # Complex APIs use Hono
        ├── index.ts  # Hono app
        └── routes/
            ├── users.ts
            └── posts.ts
```

**Example:**

```typescript
// apps/web/server/api/index.ts
import { Hono } from 'hono';

const api = new Hono()
  .get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const user = await getUser(id);
    return c.json(user);
  })
  .post('/users', async (c) => {
    const body = await c.req.json();
    const user = await createUser(body);
    return c.json(user, 201);
  });

export type ApiType = typeof api;
export default api;

// apps/web/src/routes/api.$.ts (mount Hono)
import { createFileRoute } from '@tanstack/react-router';
import api from '../../server/api';

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => api.fetch(request),
      POST: ({ request }) => api.fetch(request),
      PUT: ({ request }) => api.fetch(request),
      DELETE: ({ request }) => api.fetch(request),
    },
  },
});

// packages/api-client/src/index.ts
import { hc } from 'hono/client';
import type { ApiType } from '@raypx/api';

export const client = hc<ApiType>('/api');

// Usage in components
const res = await client.users[':id'].$get({ param: { id: '123' } });
const user = await res.json(); // Fully typed!
```

### Why This Approach?

1. **Progressive Enhancement**
   - Start simple with TanStack routes
   - Add Hono for complex APIs
   - Migrate gradually

2. **Type Safety**
   - End-to-end types with hc
   - Keep Zod for validation
   - No code generation

3. **Flexibility**
   - Simple routes stay simple
   - Complex APIs get structure
   - Easy to refactor

4. **Template-Friendly**
   - Users can choose their approach
   - No forced abstraction
   - Clear patterns

---

## Alternative: oRPC (If You Prefer RPC)

If you prefer RPC style over REST:

```typescript
// packages/api/src/router.ts
import { createRouter } from 'orpc';

export const userRouter = createRouter({
  getUser: {
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    resolve: async ({ input }) => {
      return await getUser(input.id);
    },
  },
  createUser: {
    input: z.object({ name: z.string(), email: z.string().email() }),
    output: z.object({ id: z.string() }),
    resolve: async ({ input }) => {
      return await createUser(input);
    },
  },
});

// Client
import { createClient } from 'orpc/client';
import type { userRouter } from '@raypx/api';

const client = createClient<typeof userRouter>('/api');
const user = await client.getUser({ id: '123' }); // Typed!
```

---

## Don't Do: Nitro Split (Yet)

**Avoid splitting into separate API app** because:
- ❌ Overkill for a template
- ❌ Complicates deployment
- ❌ Users expect simple structure
- ❌ Can always split later

**When to split:**
- API needs separate scaling
- Different teams own API/frontend
- Multiple frontend consumers
- Microservices architecture

---

## Implementation Plan

### Phase 1: Add Hono hc (Recommended)

```bash
# Install dependencies
bun add hono

# Create Hono API
mkdir -p apps/web/server/api/routes

# Update api-client to use hc
```

### Phase 2: Migrate Complex Routes

Move complex routes from `src/routes/api.*` to `server/api/routes/*`

### Phase 3: Document Pattern

Show users both approaches in docs

---

## Summary

### For Raypx Template: Use Hono hc ⭐

**Reasons:**
1. ✅ Type-safe without RPC abstraction
2. ✅ Keeps REST semantics
3. ✅ Lightweight addition
4. ✅ Progressive - use where needed
5. ✅ Great DX

**Don't use:**
- ❌ Nitro split (overkill)
- ⚠️ oRPC (unless you prefer RPC style)

**Result:** Simple template that scales well with type safety.

---

Want me to implement Hono hc integration?
