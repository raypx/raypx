# ADR 0034: Extensible multi-platform foundation

Status: accepted, supersedes conflicting cloud-only, no-local-runtime and all-Bun
requirements in historical ADRs. Approved by the user for this rebuild.

Remove retired business apps/libraries. Keep Web, Desktop, Mobile, API and CLI,
with eight libraries: auth, client, contracts, db, i18n, mail, ui and tooling.
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
