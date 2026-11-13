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
   `schema/orchestration.ts` (ADR 0044):
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

4. The Desktop channel migration adds `desktop_sessions`: one authenticated,
   encrypted cookie payload per API origin. AES-256-GCM associated data binds it
   to format version, profile directory and exact server origin. Session-only
   cookies stay in memory. Missing/wrong keys and unreadable ciphertext preserve
   rows and use memory only; failed writes poison the transport until daemon
   restart. Unsupported versions fail explicitly. The native bootstrap supplies
   the OS key over private IPC; cookies/keys never enter the renderer channel.

```sh
bun run --cwd apps/cli db:generate
bun run --cwd apps/cli check
```

Change the Drizzle definitions, then run `db:generate`. It invokes the workspace's
`raypx-drizzle-kit` launcher
and regenerates `migrations.generated.json` from the SQL migration files. Commit
the schema, SQL, snapshots and embedded journal together. Do not edit generated
files by hand. The check command fails if the embedded journal differs from the
SQL. Future schema changes generate additional migrations; applied migrations
are immutable.

The Bun SQLite migrator receives this embedded journal. SQLite initialization needs
no external migration files beside the executable or in the repository. Keep the
complete CLI payload, including Herdr and its inventory, for execution and terminal
features; see the packaging contract.

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

Desktop sessions live in `desktop_sessions` inside the existing CLI profile
writer. Persistent cookies use AES-GCM with profile-directory and canonical-origin
associated data. MyGo supplies a new OS key scoped to its canonical native data
and CLI profile directories; no key or cookie enters renderer messages. Session-only
cookies remain in daemon memory. Missing keys/unreadable ciphertext preserve rows
and permit memory-only sign-in; failed persistence disables transport until daemon
restart. Unsupported stored versions fail explicitly.

Go retains the independent lifetime `desktop-instance.sqlite` lock and device
preference file. It never opens the CLI database. The previous Go session store
and key namespace are never read, imported, rewritten or deleted. See ADR 0052.
