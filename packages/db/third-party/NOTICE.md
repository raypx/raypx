# Selected Drizzle helper sources

Raypx adapts the small helpers below as private DB implementation code. The
upstream packages are not dependencies, and their repository wrappers, prototype
extensions, generated clients and tooling are not vendored.

## drizzle-plus

- Project: [alloc/drizzle-plus](https://github.com/alloc/drizzle-plus).
- Source commit: `5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9`.
- Copyright (c) Alec Larson; [full MIT license](drizzle-plus.LICENSE).
- Sources: [column omission](https://github.com/alloc/drizzle-plus/blob/5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9/src/extensions/%24without.ts)
  and [excluded-column expression](https://github.com/alloc/drizzle-plus/blob/5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9/src/extensions/internal.ts).
- Adapted implementation: [query/columns.ts](../src/query/columns.ts).

Changes: standalone typed functions replace prototype methods. Updates require
explicit column keys, use physical PostgreSQL names and quote identifiers.
Automatic conflict-target discovery and private Drizzle metadata are omitted.

## better-drizzle

- Project: [almeidazs/better-drizzle](https://github.com/almeidazs/better-drizzle).
- Source commit: `f93f1b7aa528fe2db4cddc92a047e7a0ae710a0d`.
- Copyright 2026 Hiago Almeida; [full Apache-2.0 license](better-drizzle.LICENSE).
- Source: [database error classification](https://github.com/almeidazs/better-drizzle/blob/f93f1b7aa528fe2db4cddc92a047e7a0ae710a0d/src/shared/errors.ts).
- Adapted implementation: [query/errors.ts](../src/query/errors.ts).

Changes: only PostgreSQL SQLSTATE `23505` and exact constraint names are recognized.
The helper supports postgres.js `constraint_name`, standard `constraint` and
Drizzle's nested `cause`, with cycle protection. It never parses query text,
parameters or error messages. Other drivers, the client wrapper, hooks and plugins
are omitted. The upstream checkout has no separate NOTICE file.

## Maintenance

Retain these notices, license texts and source headers when copying or distributing
the adapted files. Review upstream changes against the pinned sources before
updating. Compatibility is tested against Raypx's pinned Drizzle version;
upstream peer ranges alone do not prove compatibility. The adoption boundary and
validation commands are documented in
[ADR-0028](../../../docs/architecture/decisions/0028-selective-drizzle-helpers.md).
