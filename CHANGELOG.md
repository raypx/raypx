# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project setup
- Monorepo structure with Bun workspaces
- Core packages: db, auth, logger, api, api-client, contracts, hooks, ui, config
- TanStack Start for full-stack React
- Drizzle ORM with SQLite
- Better Auth for authentication
- Evlog for logging
- Docker support (development and production)
- Comprehensive documentation
- TypeScript strict mode throughout

### Changed

- Migrated from Pino to Evlog for logging
- Simplified boundary checking using Oxlint
- Consolidated tsconfig into config package
- Adopted Bun catalog for dependency management

### Removed

- Empty placeholder packages (ai, storage, env)
- Legacy boundary check implementation

## [0.1.0] - 2024-XX-XX

### Added

- Initial release
- Production-ready template for full-stack TypeScript applications
- Comprehensive documentation and examples

[Unreleased]: https://github.com/YOUR_USERNAME/raypx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_USERNAME/raypx/releases/tag/v0.1.0
