# Unpublished library preview

This branch consumes `@voidmix/logger` from the compiled archive recorded in
[logger.json](logger.json). The implementation lives in the separate Voidmix
repository; this directory is an installation artifact, not an editable fork.

The archive is not published to npm. Its content-addressed filename and SHA256
make this branch installable without a sibling checkout or a local package link.
The metadata records the committed Voidmix source revision and individual source
checksums used to verify this preview.

To refresh it:

1. Run the logger tests and build in Voidmix, then its complete `bun run verify`.
2. Pack `packages/logger` with `bun pm pack --ignore-scripts --filename <path>`.
3. Compute the archive SHA256 and use a new filename containing that digest.
   Record the source revision, working-tree state, package source checksums,
   archive checksum and toolchain versions in `logger.json`.
4. Update the root catalog, regenerate `bun.lock`, and check a frozen install
   outside both working trees. Run the API/CLI checks and `bun run verify`.

Before merging, publish the verified Voidmix package through the authorized
release process, replace the catalog with its exact npm alpha version and remove
this preview. See [Voidmix library changes](../docs/development/intl-release.md).
