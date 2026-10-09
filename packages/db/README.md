# @raypx/db

Server-side SQLite access using better-sqlite3 and Drizzle. Import through
`@raypx/db`; no cross-package `src` or `dist` paths are supported.

```typescript
import { getDatabase, closeDatabase } from "@raypx/db";

const db = getDatabase(":memory:");
// Use Drizzle queries with application tables defined by your feature.
closeDatabase();
```

Importing this package does not open SQLite. The first `getDatabase(path)`
creates a cached connection with WAL and foreign-key checks enabled. The
fallback path is `./data/raypx.db`, relative to the process working directory;
create its parent directory before opening it. The first call selects the path
until the connection is closed. `closeDatabase()` closes the underlying SQLite
handle and clears both cached references, allowing a later call to reopen it.

`DATABASE_PATH` is not read by this helper and is not a supported env field.
The package has no application table schema, schema export, migration config,
seed runner, or PostgreSQL adapter. Installing Drizzle tooling does not create
these artifacts or make migration commands ready to run.

Web probes do not call `getDatabase()`. When activating a database-backed
feature, initialize it explicitly and register its health check and
`closeDatabase` disposer with `RuntimeLifecycle` from `@raypx/api/runtime` in
the application composition layer. Register only resources that were actually
created. The auth package currently initializes this connection during auth
module import; it is not imported by the web application.

Build and type checking use the engineering presets and tasks from
`@raypx/config`. Runtime output is ESM with declarations.
