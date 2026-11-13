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
Creating another Space atomically creates its owner membership. Member mutation,
invitations and audit workflows belong to later roadmap work.

Use public workspace entries, `.js` relative specifiers and Core domain schemas.
Run `bun run --cwd packages/spaces check` and `test`. `test:postgres` selects
`tests/postgres/` and requires a newly provisioned disposable `*_test` database.
