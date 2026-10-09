# Database Package Enhancement Plan

## Current State

**Existing functionality:**

- `getDatabase()` - Get SQLite connection
- `closeDatabase()` - Close connection
- Basic Drizzle ORM integration

## Missing Features

### 1. Schema Management ❌

- No schema exports
- No example tables
- No relations defined

### 2. Migrations ❌

- No migration utilities
- No seed data
- No migration runner

### 3. Transactions ❌

- No transaction helpers
- No rollback support
- No nested transactions

### 4. Query Helpers ❌

- No pagination utilities
- No search helpers
- No sorting utilities

### 5. Connections ❌

- No connection pooling
- No retry logic
- No health checks

### 6. Development Tools ❌

- No debug logging
- No query performance tracking
- No schema introspection

## Implementation Plan

### Phase 1: Core Schema (High Priority) ⭐

```typescript
// packages/db/src/schema/users.ts
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(() => new Date()),
});

// packages/db/src/schema/posts.ts
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// packages/db/src/schema/index.ts
export * from "./users";
export * from "./posts";

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));
```

### Phase 2: Transactions (High Priority) ⭐

```typescript
// packages/db/src/transaction.ts
export async function withTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
  const db = getDatabase();
  return await db.transaction(callback);
}

// Usage
await withTransaction(async (tx) => {
  await tx.insert(users).values({ name: "John" });
  await tx.insert(posts).values({ title: "Post", userId: 1 });
});
```

### Phase 3: Query Helpers (Medium Priority)

```typescript
// packages/db/src/helpers/pagination.ts
export async function paginate<T>(query: any, page: number, perPage: number = 10) {
  const offset = (page - 1) * perPage;

  const [items, totalCount] = await Promise.all([
    query.limit(perPage).offset(offset),
    db.select({ count: count() }).from(query),
  ]);

  return {
    items,
    pagination: {
      page,
      perPage,
      total: totalCount[0].count,
      totalPages: Math.ceil(totalCount[0].count / perPage),
    },
  };
}

// Usage
const result = await paginate(db.select().from(users), 1, 10);
```

### Phase 4: Migrations (Medium Priority)

```typescript
// packages/db/src/migrate.ts
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export async function runMigrations() {
  const db = getDatabase();
  await migrate(db, { migrationsFolder: "./migrations" });
}

export async function createMigration(name: string) {
  // Generate migration file
}
```

### Phase 5: Seed Data (Low Priority)

```typescript
// packages/db/src/seed.ts
export async function seed() {
  const db = getDatabase();

  await db.insert(users).values([
    { name: "Admin", email: "admin@example.com" },
    { name: "User", email: "user@example.com" },
  ]);
}
```

### Phase 6: Connection Pool (Low Priority)

```typescript
// packages/db/src/pool.ts
export class ConnectionPool {
  private connections: Database[] = [];
  private maxConnections = 10;

  async acquire() {
    // Get or create connection
  }

  release(connection: Database) {
    // Return to pool
  }
}
```

## Priority Ranking

1. ⭐⭐⭐ **Schema definitions** - Users need example tables
2. ⭐⭐⭐ **Transactions** - Critical for data integrity
3. ⭐⭐ **Migration utilities** - Important for schema evolution
4. ⭐⭐ **Query helpers** - Improves DX
5. ⭐ **Seed data** - Nice for development
6. ⭐ **Connection pooling** - Optimization (SQLite doesn't need it much)

## Recommended Implementation Order

### Week 1: Core Features

1. Add schema examples (users, posts)
2. Add relations
3. Add transaction helpers
4. Update README with examples

### Week 2: Developer Experience

5. Add migration runner
6. Add seed data
7. Add pagination helper
8. Add search utilities

### Week 3: Polish

9. Add debug logging
10. Add health checks
11. Add performance tracking
12. Write comprehensive tests

---

Should I start implementing Phase 1 (Schema) and Phase 2 (Transactions)?
