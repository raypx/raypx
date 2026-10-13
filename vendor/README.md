# Toolkit package snapshots

Raypx consumes `@raypx/drizzle@0.1.0` and `@raypx/intl@0.1.0` from versioned
compiled archives until npm publication. Reusable implementations are maintained
only in [raypx/packages](https://github.com/raypx/packages).

[drizzle.json](drizzle.json) and [intl.json](intl.json) record package versions,
source commits and SHA256 checksums. Tarballs contain ESM, declarations,
sourcemaps, API documentation and licenses. Drizzle's complete source notices
and licenses are package-root files. No archive imports a product workspace.
Root Bun catalogs point to these archives; Docker install stages copy `vendor/`
before frozen dependency installation.

These snapshots are intentionally tracked and are not editable source forks,
npm publication claims or cross-checkout links.

## Updating

1. Check out the intended Toolkit commit and run its complete verify gate,
   including actual isolated Bun/Node consumers and independent release checks.
2. Build through Toolkit's root Turbo command. Pack each changed package with
   Bun 1.4.0 into this directory using `bun pm pack --ignore-scripts`.
3. Use a new source-commit filename for every snapshot, even when its package
   version is unchanged, so Bun cannot reuse a cached archive with the same name.
   Update version/source/checksum metadata and the root catalog filename.
   Regenerate `bun.lock`, checking each changed archive's integrity.
4. Run the owning product facade's narrow tests, then `bun run verify`.
   Runtime changes to Drizzle also require the dedicated PostgreSQL gate.

After an authorized maintainer publishes a verified version to npm, replace its
archive catalog entry with that explicit registry version and retire its
bootstrap archive in the same consumer change.
See [ADR-0029](../docs/architecture/decisions/0029-toolkit-drizzle-extraction.md)
and [ADR-0030](../docs/architecture/decisions/0030-independent-intl-library.md).
Drizzle targets PostgreSQL with postgres.js only; its driver and entrypoint
contract is recorded in
[ADR-0031](../docs/architecture/decisions/0031-postgres-js-only-drizzle.md).
