# Contributing

Read [AGENTS.md](AGENTS.md) and the owning workspace instructions. Run narrow tests
then `bun run verify`. Keep workspace metadata, public exports and dependencies
accurate. Use `bun run workspace:new` for new packages and avoid empty abstractions.

Use isolated test databases. Default verification requires no database, GUI or
emulator. PostgreSQL, browsers, mobile bundles and packaged native release gates
are documented in [testing](docs/development/testing.md). Report unavailable checks.
