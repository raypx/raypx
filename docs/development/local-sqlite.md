# Local SQLite storage

Each CLI profile has one business database, `<profile>/profile.sqlite`. State,
Memory, Agent, Terminal, Pi context and credential repositories borrow the profile writer.
The runtime owns `ProfileStorage`: it opens the database, runs migrations once,
injects the writer and closes it after producers and pending requests drain.
Repositories never migrate or close borrowed connections. Operations across
repositories can share one Drizzle transaction. Independent profile owners in
other processes still use separate connections. The database and auxiliaries use private POSIX permissions (directory 0700, files 0600) or a Windows DACL restricted to the current user and SYSTEM. The directory ACL is inheritable so newly created WAL/SHM/journal files remain private; unsupported paths and permission failures stop initialization.

`apps/cli/src/runtime/sqlite/schema/` owns the table definitions by feature;
`schema.ts` exports the complete profile schema. Generated migrations under
`apps/cli/drizzle/` create the current tables and indexes:

1. The initial migration creates the state, Memory, Agent, Terminal and Pi tables.
2. The second migration adds the Agent orchestration tables from
   `schema/orchestration.ts` ([ADR 0044](../architecture/0044-event-sourced-cli-orchestration.md)):
   `task_events` (durable non-activity domain events, indexed by binding, task and
   sequence) and `task_effects` (effect intents and their `open`, `done`,
   `failed` or `abandoned` status, indexed by task, status and settle time).
   It creates tables only and never backfills: tasks from before it stay
   projection-only, and their records remain readable. Activity is never stored in
   `task_events`. Startup marks open effects abandoned and prunes settled effects
   older than seven days; clearing local history deletes both tables' rows for the
   forgotten tasks.

3. The credential migration adds `instance_credentials` (instance UUID/private key) and
   `host_authorizations` (origin/account/device/epoch-bound authorization). These tables
   survive history clearing. Online logout/revocation removes only the affected Host
   authorization; it never deletes the instance key. No old credential store is read or
   migrated. Credential repositories borrow `ProfileStorage`, including `login` and
   `ai complete`; offline `ai providers/models` never create a profile database.

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

The Bun SQLite migrator receives this embedded journal. SQLite initialization needs
no external migration files beside the executable or in the repository. Keep the
complete CLI payload, including Herdr and its inventory, for execution and terminal
features; see the [packaging contract](../architecture/0047-bun-cli-production-packaging.md).

Startup holds a separate SQLite migration lock while configuring WAL, checking
the migration ledger and running `migrate()`. This serializes independent CLI
processes, including the ledger read that Drizzle performs before its migration
transaction. Waiters allow 30 seconds for the queue ahead of them, longer than the
5-second business-write timeout. Kernel locks release if the owner exits.
Daemon/project ownership locks also remain separate from the business database,
so a long-lived owner does not hold its business write lock.

Startup opens only `<profile>/profile.sqlite` and initializes it when absent.
Unmanaged tables, unsupported ledger formats and unknown migration records in
that file fail explicitly. Other files in the profile directory do not participate
in storage initialization.

Default integration tests exercise initialization, reopen, cross-store visibility,
cross-repository rollback, owner closure, validated stored JSON, rejected formats and six processes starting at
once. Committed SQLite snapshots also verify that opening, writing, rolling back
and reopening preserve existing rows and the migration ledger. `apps/cli`'s
`smoke` and `smoke:pi` commands additionally run copied compiled
executables outside the repository.

Desktop's Go host separately owns `mygo-sessions-v3.sqlite` for server-scoped persistent
Cookies. It never opens the CLI database or uses the lifetime exclusive
`desktop-instance.sqlite` transaction for sessions. Cookies remain native;
Cookie rows are encrypted with a key held in MyGo's system credential store; filesystem permissions also protect the database.
An unreadable store keeps sign-in in memory without touching stored rows; a failed
write disables session transport until restart. Host authorization may explicitly
report memory-only mode.
