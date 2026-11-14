# @raypx/spaces

`/server` exposes the database-free repository/admission ports and SpaceScope.
`/server/postgres` implements Space/member reads and account-scoped discovery and
bootstrap. API supplies the current session account ID. `resolve` checks
the selected Space's member row on every request and returns an opaque SpaceScope;
never deserialize or cache a scope across requests. Deployment roles grant nothing.
`resolveSpaceScope` also admits trusted, freshly read membership rows for backend
Run recovery, without invoking account bootstrap or impersonating the wake-up caller.

Content repositories require SpaceScope and filter in SQL. Account-scoped discovery
and private-Space creation are the necessary entry into this boundary: no global
Space lookup is exposed. Bootstrap locks the account and uses `spaces.private_for`
to create one private owner Space even when other memberships already exist.
Creating another Space atomically creates its owner membership and audit records.
`SpaceManagement` adds owner settings, invitations, rename/deletion claims, member
directory and mutations, audit pagination and ordered Space events. Its PostgreSQL
constructor requires transactional Run/card cancellation from API; construction
performs no I/O. Membership mutations serialize on the Space row and recheck roles.
Auto approval overrides require the injected deployment reviewer availability;
the capability never changes Space admission or supplies member credentials.
Removed memberships retain `removed_at` tombstones for same-Space resource keys;
only rows with no removal time grant access. `removal_reason` preserves removed/left
for stable stream closure after lost hints. Removal pauses retained routines and
removes their credentials and connection selections. Invitations retain only token
hashes. Audit appends intent/outcome rows, committing success with the mutation;
missing audit storage blocks writes. LISTEN hints invalidate streams; event replay
and every admission still read PostgreSQL.

Use public workspace entries, `.js` relative specifiers and Core domain schemas.
Run `bun run --cwd packages/spaces check` and `test`. `test:postgres` selects
`tests/postgres/` and requires a newly provisioned disposable `*_test` database.

Page changes add independent Space events without changing conversation variants.
Soft removal clears account skill/MCP availability and per-member Agent selections
before the membership tombstone is marked removed. Shared Page/skill text survives
member departure; retained membership identity grants no access.

Invitation-only deployment signup can bind a bearer invitation to one registration account. Preview/accept refuses other accounts after that binding; explicit acceptance still owns membership and its audit/events. Deployment roles confer no Space membership.
