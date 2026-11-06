# Raypx Kit preview archives

`devkit.json` records the source checksums, base commit and archive integrity of the
unpublished Devkit build supporting native pnpm workspace configuration. The archive
keeps the package manifest version; it does not claim a new registry release.

Update the implementation in Raypx Kit, run its package tests, check, build and
archive consumer checks, then pack with scripts disabled. Copy the archive using a
new content-hash filename, update provenance and the pnpm workspace catalog, and
run pnpm install and verify. Remove this archive and metadata when adopting the
exact published alpha before merging. See [the release workflow](../docs/development/intl-release.md).
