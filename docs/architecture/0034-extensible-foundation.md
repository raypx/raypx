# ADR 0034: Extensible multi-platform foundation

Status: accepted, supersedes conflicting cloud-only, no-local-runtime and all-Bun
requirements in historical ADRs. Approved by the user for this rebuild.

Remove retired business apps/libraries. Keep Web, Desktop, Mobile, API and CLI
(Mobile was later removed on 2026-10-18; phones use Web until native needs return),
with eight libraries: auth, client, contracts, database, i18n, mail, ui and tooling.
Theme is part of UI; local implementation remains inside CLI runtime. Source
exports and explicit per-entry platform metadata allow future package extraction.

Replace name allowlists and exhaustive documentation inventories with manifest
discovery. Keep one Turbo graph and Bun catalogs. Nix locks the development shell
only. Node runs production API; compiled CLI and Electrobun include their runtimes.

The account database and migration history are new and independent. Old SQL is
historical and must not be applied by the foundation commands. No old user data
or volumes are changed as part of the rebuild.

Consequences: entrypoint/platform checks and generator templates require maintenance,
but ordinary packages no longer require edits to a central architecture whitelist,
root task catalog or CI package-name matrix.

Amendment (2026-10-15), approved by the user: the Nix development shell was removed.
Windows needed native installs anyway and every runtime upgrade required per-platform
hashes; `.nvmrc` and the root `packageManager` now pin Node and Bun for version managers
and CI, and `raypx-dev policy` keeps the remaining literal pins in sync. Web became a
separate TanStack Start SSR service on Node/Nitro beside API; Desktop uses Start SPA mode.

Amendment (2026-10-15): Web and Desktop now share their DOM authentication form
through auth's browser client entry. Each application keeps its own file routes,
clients, query access and navigation adapters; universal auth hooks and UI
primitives keep their existing boundaries.
