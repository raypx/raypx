# @raypx/db

Server-only SQLite with typed Drizzle queries. Bun uses native `bun:sqlite`;
Node uses better-sqlite3. Importing the
package opens no database and applies no migrations. Public entry points are
`@raypx/db` and `@raypx/db/schema`.

```typescript
import { createDatabase, eq } from "@raypx/db";
import { user } from "@raypx/db/schema";

const connection = createDatabase("./data/raypx.db");
try {
  connection.checkHealth();
  const person = connection.db.select().from(user).where(eq(user.id, userId)).get();
} finally {
  connection.close();
}
```

`createDatabase(path, { busyTimeoutMs? })` returns a `DatabaseConnection` with
`db`, `checkHealth()`, and idempotent `close()`. File parent directories are
created automatically, foreign keys are enforced, and file databases use WAL.
The default lock timeout is 5000 ms. `:memory:` creates an isolated in-memory
database. Register the handle's check and disposer with the application's
runtime lifecycle only after creating it.

`getDatabase(path = "./data/raypx.db")` and `closeDatabase()` remain lazy
compatibility helpers. The first path selects their singleton until it closes;
independent `createDatabase` handles are unaffected. Runtime helpers do not read
environment variables.

The schema includes Better Auth's `user`, `session`, `account`, and
`verification` tables, string IDs, millisecond `Date` columns, unique email and
session token constraints, lookup indexes, and user relations. Deleting a user
cascades to sessions and accounts. Credential hashes and provider tokens belong
to `account`; select public fields explicitly when exposing user information.

Apply migrations before enabling a database-backed feature or starting an
application with authentication enabled:

```bash
# From the repository root; the CLI reads DATABASE_PATH or ./data/raypx.db.
bun packages/db/src/cli.ts

# Generate a checked-in migration after modifying the schema.
cd packages/db
bun run drizzle-kit generate --name=describe-change
```

`runMigrations(db, { migrationsFolder? })` is available for explicit deployment
tools and test fixtures. Its default folder resolves from the module URL, works
from `src` and `dist` independently of the working directory, and is included in
package assets. Keep the package intact or supply a folder when bundling its
migration runner. Applied migrations are recorded by Drizzle; repeated calls
preserve rows. Opening a connection never runs DDL. The CLI prints fixed error
messages without paths, environment values, or driver error details.

Transactions use synchronous SQLite operations:

```typescript
import { withTransaction } from "@raypx/db";
import { user } from "@raypx/db/schema";

withTransaction(connection.db, (tx) => {
  tx.insert(user).values({ id: "person", name: "Person", email: "person@example.com" }).run();
  // Additional .run(), .get(), or .all() queries share this transaction.
});
```

`RaypxDatabase` exposes the drivers' common synchronous Drizzle interface;
driver-specific `.run()` results have type `unknown`. `withTransaction` rolls
back on thrown errors and rejects async callbacks and
Promise results. Never start asynchronous work inside a transaction. Nested
`tx.transaction(...)` calls use savepoints. No connection pool is needed for
this single-process SQLite foundation.

Build, strict type checking, lint, and tests use `@raypx/config` tasks. Tests
cover migration idempotence, file persistence and disposal, constraints and
relations, transaction rollback and savepoints, connection isolation, and the
actual Bun migration CLI. Auth tests also exercise the native Bun driver.
