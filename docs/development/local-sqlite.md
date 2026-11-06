# Local SQLite storage

Each CLI profile has one business database, `<profile>/profile.sqlite`. State,
Memory, Agent, Terminal, Pi context and credential repositories borrow the profile writer.
The runtime owns `ProfileStorage`: it opens the database, runs migrations once,
injects the writer and closes it after producers and pending requests drain.
Repositories never migrate or close borrowed connections. Operations across
repositories can share one Drizzle transaction. Independent profile owners in
other processes still use separate connections. The database and auxiliaries use private POSIX permissions (directory 0700, files 0600) or a Windows DACL restricted to the current user and SYSTEM. The directory ACL is inheritable so newly created WAL/SHM/journal files remain private; unsupported paths and permission failures stop initialization.

Node's `node:sqlite` supplies the synchronous connection; Drizzle's `node-sqlite`
driver supplies typed queries and transactions/savepoints. The runtime migration
changes the driver, not the existing SQLite schemas or applied migration history.

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
pnpm --dir apps/cli run db:generate
pnpm --dir apps/cli run check
```

Change the Drizzle definitions, then run `db:generate`. It invokes drizzle-kit
and regenerates `migrations.generated.json` from the SQL migration files. Commit
the schema, SQL, snapshots and embedded journal together. Do not edit generated
files by hand. The check command fails if the embedded journal differs from the
SQL. Future schema changes generate additional migrations; applied migrations
are immutable.

The Node SQLite migrator receives this journal embedded in the bundled ESM.
The CLI requires its complete runtime directory, but no external migration SQL
files or repository checkout. See [CLI distribution](../../apps/cli/README.md#build-and-distribution).

Startup holds a separate SQLite migration lock while configuring WAL, checking
the existing Drizzle ledger and applying the embedded SQL journal. The Node
migrator preserves that ledger's format and serializes reads and migration
transactions across independent CLI processes. Kernel locks release if the owner
exits. Daemon/project ownership
locks also remain separate from the business database, so a long-lived owner
does not hold its business write lock.

Startup opens only `<profile>/profile.sqlite` and initializes it when absent.
Unmanaged tables, unsupported ledger formats and unknown migration records in
that file fail explicitly. Other files in the profile directory do not participate
in storage initialization.

Default integration tests exercise initialization, reopen, cross-store visibility,
cross-repository rollback, owner closure, validated stored JSON, rejected formats and six processes starting at
once. `apps/cli`'s `smoke` additionally relocates the complete distribution outside
the repository; `smoke:pi` relocates an ESM fixture with the running Node interpreter.

Desktop's Rust host separately owns `tauri-sessions.sqlite` for server-scoped
persistent cookies. Cookie batches are AES-GCM ciphertext authenticated against
their server scope; a separate system credential-store key belongs to the Tauri
data directory. Private filesystem permissions also protect SQLite auxiliaries.
The host never opens the CLI business database or shares the lifetime exclusive
`desktop-instance.sqlite` transaction with sessions. Missing keys or unreadable
ciphertext preserve stored rows and permit in-memory sign-in; a failed session
write disables that session transport until restart.

Tauri does not read, import or delete previous-host login storage. Sign in once
after the switch; existing CLI profiles, grants, offline identity and history stay
local.
CLI Host authorization is a separate record in `profile.sqlite` and may explicitly
report memory-only mode. See [Desktop sessions](desktop.md#apply-and-isolate).
