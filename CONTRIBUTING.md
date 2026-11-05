# Contributing

Read [AGENTS.md](AGENTS.md) and the owning workspace instructions. Run narrow tests
then `pnpm run verify`. Keep workspace metadata, public exports and dependencies
accurate. Use `pnpm run workspace:new` for new packages and avoid empty abstractions.

Use isolated test databases. Default verification requires no database, GUI or
emulator. PostgreSQL, browsers and packaged native release gates
are documented in [testing](docs/development/testing.md). Report unavailable checks.
