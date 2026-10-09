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
Browser ← api-client, hooks, ui, contracts
Server  ← api, auth
Infra   ← db, logger, config
```

**Rules:**

- Browser packages CANNOT import server packages
- Server packages CAN import infrastructure packages
- All layers can use contracts (Zod schemas)

### 2. Type Safety

- **Strict TypeScript** - No `any` types allowed
- **Runtime Validation** - Zod schemas for all external data
- **Type Inference** - Drizzle provides database types automatically

### 3. Package Boundaries

Each package has a clear responsibility:

| Package      | Purpose            | Can Import                          |
| ------------ | ------------------ | ----------------------------------- |
| `db`         | Database access    | `logger`                            |
| `auth`       | Authentication     | `db`, `logger`                      |
| `logger`     | Structured logging | Nothing                             |
| `api`        | Business logic     | `db`, `auth`, `logger`, `contracts` |
| `contracts`  | Schemas            | Nothing                             |
| `api-client` | HTTP client        | `contracts`                         |
| `hooks`      | React hooks        | `api-client`                        |
| `ui`         | UI components      | Nothing                             |
| `config`     | Build tools        | Nothing                             |

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

1. **Define schema** in `packages/contracts/src/`

   ```typescript
   export const createUserSchema = z.object({
     name: z.string().min(1),
     email: z.string().email(),
   });
   ```

2. **Create route** in `apps/web/src/routes/`

   ```typescript
   // apps/web/src/routes/api.users.ts
   import { createFileRoute } from "@tanstack/react-router";
   import { createUserSchema } from "@raypx/contracts";

   export const Route = createFileRoute("/api/users")({
     server: {
       handlers: {
         async POST({ request }) {
           const body = await request.json();
           const data = createUserSchema.parse(body);
           // Implement logic...
         },
       },
     },
   });
   ```

3. **Add client function** in `packages/api-client/src/`
   ```typescript
   export async function createUser(data: CreateUser) {
     const response = await fetch("/api/users", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(data),
     });
     return response.json();
   }
   ```

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

### Adding a React Hook

1. **Create hook** in `packages/hooks/src/`

   ```typescript
   import { useState, useEffect } from "react";
   import { getUsers } from "@raypx/api-client";

   export function useUsers() {
     const [users, setUsers] = useState([]);
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       getUsers().then((data) => {
         setUsers(data);
         setLoading(false);
       });
     }, []);

     return { users, loading };
   }
   ```

2. **Export from index**
   ```typescript
   export { useUsers } from "./users";
   ```

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
import { getUsers } from "@raypx/api-client";
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
