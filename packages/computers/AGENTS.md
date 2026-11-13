# @raypx/computers

`/server` owns team-computer lifecycle and database-free ports. `/server/postgres`
owns Space-scoped persistence and transactional computer.state events for every
Conversation in that Space. API resolves fresh SpaceScope and injects the provider.
Member directory/file reads use that scope, never provision compute, and expose
explicit unavailable states. Previews cap at 200 entries or 64 KiB of file bytes.

Read never provisions. Start lazily claims the unique team row under the Space lock.
Lifecycle leases serialize backend callers; a start increments the provider generation.
Completion compares generation and lease fence. These leases do not implement future
per-Agent Run execution leases. Private scope is constrained but has no writer yet.
No configured provider is an explicit state; it does not allocate rows or host processes.
Never persist vendor names or credentials. Failed operations keep the home revision.

Run check and test. test:postgres requires a freshly created disposable *_test database;
never run against an existing operator database. Tests use only their own fixtures.
