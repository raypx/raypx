# Toolkit release snapshot

Raypx consumes `@raypx/drizzle@0.1.0` from this versioned tarball until its first
npm publication. Reusable source and the complete capability/merge documents
are maintained only in [raypx/toolkit](https://github.com/raypx/toolkit).

[drizzle.json](drizzle.json) records the source commit, exact peer and SHA256.
The tarball contains compiled ESM, declarations, sourcemaps, API documentation,
CHANGELOG and complete upstream license/provenance files. It has no product
workspace runtime dependency. The root Bun catalog points to the archive;
Docker install stages copy `vendor/` before frozen dependency installation.

This checked release snapshot is intentionally tracked. It is not a second
editable source fork, a claim of npm publication or a cross-checkout link.

## Updating

1. Check out the intended Toolkit commit and run its complete verify gate,
   including actual isolated tarball consumers and independent release checks.
2. Build through Toolkit's root Turbo command. Pack its Drizzle package with
   Bun 1.4.0 into this directory using `bun pm pack --ignore-scripts`.
3. Update source commit/version/checksum metadata and the root catalog filename.
   Regenerate `bun.lock`, ensuring the archived dependency's integrity changes.
4. Run Raypx DB unit/PostgreSQL tests, generation without schema drift and
   `bun run verify`. Keep authentication, permissions, migrations and data in DB.

After an authorized maintainer publishes this verified version to npm, replace
its root catalog archive specification with the explicit registry version,
regenerate the lockfile and retire the bootstrap archive in the same consumer
change. See [ADR-0029](../docs/architecture/decisions/0029-toolkit-drizzle-extraction.md).
