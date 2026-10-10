# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Add P1 reusable foundations: account schema/migrations, Bun and Node SQLite
  drivers, explicit auth endpoints, request metrics/security guards, validated
  caches, async hooks, and nine shadcn primitives with browser-tested stories.

### Added

- Initial project setup
- Monorepo structure with Bun workspaces
- Initial core packages: db, auth, logger, api, api-client, contracts, hooks, ui,
  config (former client/hook names; see the migration below)
- TanStack Start for full-stack React
- Drizzle ORM with SQLite
- Better Auth for authentication
- Evlog for logging
- Docker support (development and production)
- Comprehensive documentation
- TypeScript strict mode throughout

### Changed

- Consolidated `api-client` into `@raypx/client`: HTTP entrypoints remain free
  of React, while `@raypx/client/react` owns business hooks and TanStack Query.
  Component behavior hooks now live in `@raypx/ui/hooks`. Start integration
  and a separate QueryClient per SSR router remain in web.
- Extended AST boundaries to enforce the client core/React entrypoint split,
  `client → contracts`, and UI's independence from business workspaces.
- Migrated from Pino to Evlog for logging
- Simplified boundary checking using Oxlint
- Consolidated tsconfig into config package
- Adopted Bun catalog for dependency management

### Removed

- Standalone `@raypx/api-client` and `@raypx/hooks` workspaces; old imports have
  no compatibility aliases. Use `@raypx/client`, `@raypx/client/react`, or
  `@raypx/ui/hooks` according to responsibility.
- Empty placeholder packages (ai, storage, env)
- Legacy boundary check implementation

## [0.1.0] - 2024-XX-XX

### Added

- Initial release
- Production-ready template for full-stack TypeScript applications
- Comprehensive documentation and examples

[Unreleased]: https://github.com/YOUR_USERNAME/raypx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_USERNAME/raypx/releases/tag/v0.1.0
