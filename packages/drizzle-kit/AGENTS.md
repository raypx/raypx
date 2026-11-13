# @raypx/drizzle-kit

Private Bun tooling for PostgreSQL and local SQLite schema development. Database
and CLI consume `raypx-drizzle-kit` and the upstream `Config` type as development
dependencies. Runtime migrations use Drizzle ORM.

The launcher stages the official CLI and adjacent skills in an isolated temporary
directory under this workspace's dependency tree. It preserves the caller's working
directory, inherited streams and exit code, then removes its staging directory.
Keep Drizzle Kit and ORM at the same exact version and use postgres.js for Studio.
Preserve upstream bytes. The extractor comes from Raypx Kit at
`a79f0f271f9163c68d9931386dc7d7e14d9353ef`. Retain its `LICENSE`.
