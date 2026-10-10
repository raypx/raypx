# AI Development Guide for Raypx

This document helps AI assistants understand the Raypx codebase and make effective contributions.

## Project Overview

**Raypx** is a production-ready, type-safe full-stack TypeScript template using:

- **Bun** - Fast JavaScript runtime
- **TanStack Start** - Full-stack React framework
- **Drizzle ORM** - Type-safe database queries
- **Better Auth** - Authentication system
- **Monorepo** - Bun workspaces with clear boundaries

## Quick Context

### What This Project Does

Provides a template for building modern web applications with end-to-end type safety, from database to UI. It's designed to be forked and customized.

### Target Users

- Developers starting new full-stack projects
- Teams wanting a type-safe foundation
- Projects needing authentication and database out of the box

## Architecture Principles

### 1. Layer Separation

```
Browser ← client core, client/react, ui, ui/hooks, contracts
Server  ← api, auth
Infra   ← db, storage, env/server, logger
Tools   ← config (development only)
```

**Rules:**

- Browser packages CANNOT import server packages
- Server packages CAN import infrastructure packages
- Contracts are browser-safe; workspace imports must follow the table below.
  UI keeps business contracts outside its component layer.

### 2. Type Safety

- **Strict TypeScript** - No `any` types allowed
- **Runtime Validation** - Zod schemas for all external data
- **Type Inference** - Drizzle provides database types automatically

### 3. Package Boundaries

Each package has a clear responsibility:

| Package     | Purpose                                      | Business workspace imports                            |
| ----------- | -------------------------------------------- | ----------------------------------------------------- |
| `db`        | SQLite schema, migrations, and lifecycle     | `env`, `logger`                                       |
| `auth`      | Explicit auth factory and sessions           | `contracts`, `db`, `env`, `logger`                    |
| `logger`    | Structured logging                           | None                                                  |
| `api`       | HTTP boundaries and server logic             | `contracts`, `auth`, `db`, `storage`, `env`, `logger` |
| `contracts` | Browser-safe schemas                         | None                                                  |
| `client`    | React-free HTTP core; separate React adapter | `contracts`                                           |
| `ui`        | Components and component behavior hooks      | None                                                  |
| `storage`   | Storage drivers and validated cache          | `env`, `logger`                                       |
| `worker`    | In-process task execution                    | `logger`                                              |
| `env`       | Explicit client/server configuration exports | None                                                  |
| `config`    | Build tools and static TypeScript presets    | None                                                  |

`@raypx/client` and its HTTP subpaths must not import React, TanStack Query,
or `client/src/react`, even through reexports or relative paths. Shared,
browser-safe data hooks with a clear React adapter belong in `@raypx/client/react`;
product-specific hooks start in `apps/web/src/features/<feature>/hooks`.
Component behavior such as debounce belongs in `@raypx/ui/hooks`.
The former `@raypx/api-client` and `@raypx/hooks` workspaces
are removed without compatibility aliases.

Start integration belongs in `apps/web`, not the universal client. Create a
QueryClient for each SSR router/request and retain that router's client in the
browser; never share a server query cache at module scope. SSR prefetching must
use request-aware query functions. Private query keys include account identity,
and auth changes must cancel and clear private cached data.

Engineering `@raypx/config` dependencies are allowed only for development;
runtime source cannot import its tools. Use its `tsconfig/*.json` presets.
Run `bun run check:boundaries` after changing imports or dependencies.

Promote application data capabilities to public packages only after real reuse
across applications or independent consumers is demonstrated. Two components
in one feature are not evidence that a new public API is needed. The promoted
API must have stable validated contracts, browser-safe transport, explicit
framework adaptation, and tests/documentation for its public exports. It must
work without product routes, application stores, server configuration, or a
shared server QueryClient. Keep product workflows and composition in web;
the client is a reusable data boundary, not an application store.

See [architecture references](ARCHITECTURE.md#references-for-these-boundaries)
for the shadcn, LobeHub, and TanStack practices behind these boundaries.

## Code Patterns

### Database Queries

```typescript
// ✅ Good - Type-safe, clear
import { getDatabase } from "@raypx/db";
import { users } from "@raypx/db/schema";
import { eq } from "drizzle-orm";

const db = getDatabase();
const user = await db.select().from(users).where(eq(users.id, userId));

// ❌ Bad - Raw SQL, no types
const user = await db.execute("SELECT * FROM users WHERE id = ?", [userId]);
```

### API Routes

```typescript
// ✅ Good - Type-safe, validated
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const requestSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      async POST({ request }) {
        const body = await request.json();
        const data = requestSchema.parse(body); // Throws if invalid

        // Use validated data...
        return Response.json({ success: true });
      },
    },
  },
});

// ❌ Bad - No validation
async POST({ request }) {
  const body = await request.json();
  const { name, email } = body; // Could be anything!
  // ...
}
```

### Error Handling

```typescript
// ✅ Good - Specific errors, logging
import { logger } from "@raypx/logger";

try {
  const result = await riskyOperation();
  return Response.json(result);
} catch (error) {
  logger.error("Operation failed", {
    error: error instanceof Error ? error.message : "Unknown error",
    context: { userId, timestamp: Date.now() },
  });

  return Response.json({ error: "Operation failed" }, { status: 500 });
}

// ❌ Bad - Silent failure
try {
  const result = await riskyOperation();
  return Response.json(result);
} catch (error) {
  // Nothing!
}
```

### Authentication

```typescript
// ✅ Good - Check auth first
import { requireAuth } from "@raypx/auth";

export async function GET({ request }) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session; // Not authenticated

  // User is authenticated, safe to proceed
  const userId = session.user.id;
  // ...
}

// ❌ Bad - No auth check
export async function GET({ request }) {
  // Directly access sensitive data without checking auth
  const users = await db.select().from(users);
  return Response.json(users); // Security issue!
}
```

## Common Tasks

### Adding a New API Endpoint

The users endpoint below illustrates a new product feature; it is not an
existing template API. Begin in web, colocating contracts, a browser client,
server implementation, and hooks in `src/features/users/`. Declare any new
external dependencies in the application. Reuse the existing public HTTP and
request-boundary helpers without moving the entire feature into shared packages.

1. **Define feature contracts** in `apps/web/src/features/users/contracts.ts`

   ```typescript
   import { z } from "zod";

   export const createUserSchema = z.object({
     name: z.string().min(1),
     email: z.string().email(),
   });
   export type CreateUser = z.infer<typeof createUserSchema>;
   export const createUserResponseSchema = z.object({
     user: z.object({ id: z.string(), name: z.string(), email: z.string().email() }),
   });
   ```

2. **Implement the feature's server handler** in
   `apps/web/src/features/users/server/users.server.ts`, validating external input
   and using the shared HTTP boundary. **Bind it to a route** in `apps/web/src/routes/`.

   ```typescript
   // apps/web/src/routes/api.users.ts
   import { createFileRoute } from "@tanstack/react-router";
   import { createUserResponse } from "../features/users/server/users.server";

   export const Route = createFileRoute("/api/users")({
     server: { handlers: { POST: createUserResponse } },
   });
   ```

3. **Add a validated feature client** in `apps/web/src/features/users/client/users.ts`

   ```typescript
   import { requestJson } from "@raypx/client/http";
   import { createUserResponseSchema, type CreateUser } from "../contracts";

   export function createUser(data: CreateUser) {
     return requestJson({
       path: "/api/users",
       method: "POST",
       body: data,
       schema: createUserResponseSchema,
     });
   }
   ```

4. **Compose query/mutation hooks** in `apps/web/src/features/users/hooks/`.
   Keep product permissions, routing, and workflow state in the application.
   When another application needs the same stable capability, promote its
   contracts to `@raypx/contracts`, transport to `@raypx/client`, and React
   adapter to `@raypx/client/react`, adding explicit public exports and tests.

### Adding a Database Table

1. **Define schema** in `packages/db/src/schema.ts`

   ```typescript
   export const posts = sqliteTable("posts", {
     id: integer("id").primaryKey({ autoIncrement: true }),
     title: text("title").notNull(),
     content: text("content").notNull(),
     userId: integer("user_id")
       .notNull()
       .references(() => users.id),
     createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
   });
   ```

2. **Generate migration**

   ```bash
   cd packages/db
   bun drizzle-kit generate
   bun drizzle-kit migrate
   ```

3. **Use in code**
   ```typescript
   import { posts } from "@raypx/db/schema";

   const allPosts = await db.select().from(posts);
   ```

### Adding React Data and Component Behavior

Product data hooks start in `apps/web/src/features/<feature>/hooks` and use
validated feature clients plus the application's QueryClient. Cross-application
data capabilities can be promoted to `packages/client/src/react/` after meeting
the reuse conditions above, with explicit `@raypx/client/react` exports.
For the existing shared health capability:

```tsx
import { useHealthCheck } from "@raypx/client/react";
import { Button, ConnectionStatus } from "@raypx/ui";

export function ServiceStatus() {
  const { status, retry } = useHealthCheck();
  return (
    <section aria-label="Service status">
      <ConnectionStatus status={status} />
      <Button disabled={status === "loading"} onClick={retry}>
        Retry
      </Button>
    </section>
  );
}
```

The application supplies its QueryClient provider. Generic consumers can use
`createQueryClient` and `ClientProvider`; Start owns its SSR integration in web.
Component-only hooks such as `useDebouncedValue` belong in
`packages/ui/src/hooks/` and are exposed through `@raypx/ui/hooks`. UI must not
import the client, contracts, routing, or business data modules.

## Testing Strategy

### What to Test

1. **Database Queries** - Ensure schema matches expectations
2. **API Routes** - Test validation and business logic
3. **Authentication** - Verify protected routes work
4. **Utilities** - Test pure functions

### Testing Pattern

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("User API", () => {
  beforeEach(() => {
    // Setup: Create fresh database
  });

  it("should create user with valid data", async () => {
    const response = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Test", email: "test@example.com" }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.user.email).toBe("test@example.com");
  });

  it("should reject invalid email", async () => {
    const response = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Test", email: "invalid" }),
    });

    expect(response.status).toBe(400);
  });
});
```

## Common Pitfalls

### 1. Importing Server Code in Browser

```typescript
// ❌ WRONG - This will break!
// In a browser-side component:
import { getDatabase } from "@raypx/db"; // Server-only!

// ✅ RIGHT - Use API client
import { getSession } from "@raypx/client/session";
```

### 2. Not Validating Input

```typescript
// ❌ WRONG - Trust user input
const { name } = await request.json();
await db.insert(users).values({ name });

// ✅ RIGHT - Validate first
const schema = z.object({ name: z.string().min(1).max(100) });
const { name } = schema.parse(await request.json());
await db.insert(users).values({ name });
```

### 3. Exposing Sensitive Data

```typescript
// ❌ WRONG - Return password hash
const user = await db.select().from(users).where(eq(users.id, id));
return Response.json(user); // Includes password!

// ✅ RIGHT - Exclude sensitive fields
const user = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email,
    // password intentionally omitted
  })
  .from(users)
  .where(eq(users.id, id));
return Response.json(user);
```

## Performance Considerations

### Database

- **Use indexes** for frequently queried columns
- **Batch operations** when possible
- **Avoid N+1 queries** - use joins or batch fetching

### API

- **Validate early** - Reject bad requests quickly
- **Use pagination** for list endpoints
- **Cache expensive operations**

## Documentation Standards

### JSDoc Format

````typescript
/**
 * Fetches user by ID with caching
 *
 * @param userId - User ID to fetch
 * @returns User object or null if not found
 * @throws {Error} If database connection fails
 *
 * @example
 * ```typescript
 * const user = await getUser('123');
 * if (user) {
 *   console.log(user.name);
 * }
 * ```
 */
export async function getUser(userId: string) {
  // Implementation...
}
````

## Questions to Ask

When implementing a feature, consider:

1. **Is this browser-safe?** - Can it run in the browser or is it server-only?
2. **Is input validated?** - Are we checking all external data?
3. **Is it type-safe?** - Are we using proper TypeScript types?
4. **Is it logged?** - Do we log errors and important events?
5. **Is it tested?** - Do we have tests for the happy path and edge cases?
6. **Is it documented?** - Do we have JSDoc comments?

## Getting Help

- Check [ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- Review existing implementations in similar packages
- Look at tests for usage examples
- Check TanStack Start and Drizzle docs for API patterns

---

**Remember:** This is a template. Make it your own, but maintain the type safety and clear boundaries.
