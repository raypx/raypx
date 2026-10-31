# Local SQLite storage

Each CLI profile has one business database, `<profile>/profile.sqlite`. State,
Memory, Agent, Terminal and Pi context stores open separate connections to that
file. Closing one store leaves the other connections usable. WAL and the busy
timeout apply consistently to every connection. The database is private on POSIX.

`apps/cli/src/runtime/sqlite/schema/` owns the table definitions by feature;
`schema.ts` exports the complete profile schema. A single generated initial
migration under `apps/cli/drizzle/` creates the current tables and indexes.

```sh
bun run --cwd apps/cli db:generate
bun run --cwd apps/cli check
```

Change the Drizzle definitions, then run `db:generate`. It invokes drizzle-kit
and regenerates `migrations.generated.json` from the SQL migration files. Commit
the schema, SQL, snapshots and embedded journal together. Do not edit generated
files by hand. The check command fails if the embedded journal differs from the
SQL. Future schema changes generate additional migrations; applied migrations
are immutable.

The Bun SQLite migrator receives this embedded journal. The compiled CLI needs
only its executable at runtime; it does not look for migration files beside the
binary or in the repository.

Startup holds a separate SQLite migration lock while configuring WAL, checking
the migration ledger and running `migrate()`. This serializes independent CLI
processes, including the ledger read that Drizzle performs before its migration
transaction. Kernel locks release if the owner exits. Daemon/project ownership
locks also remain separate from the business database, so a long-lived owner
does not hold its business write lock.

Startup opens only `<profile>/profile.sqlite` and initializes it when absent.
Unmanaged tables, unsupported ledger formats and unknown migration records in
that file fail explicitly. Other files in the profile directory do not participate
in storage initialization.

Default integration tests exercise initialization, reopen, cross-store visibility,
independent connection closure, rejected formats and six processes starting at
once. `apps/cli`'s `smoke` and `smoke:pi` commands additionally run copied compiled
executables outside the repository.
