# @raypx/jobs

Web and Desktop no longer expose project/session or automation pages. This package
remains with the earlier device-owned runtime; it does not implement Space-owned
Agents or routines. Orphaned public entries use `raypx.entryConsumers` to name their
later removal. Do not reconnect them to the phase 1 Agents workspace.

## Purpose

Injected cloud use cases and shared browser views for local/cloud jobs.

## Interface

- `/client` owns DOM views and injected ports; apps own routing and authentication.
  Its controlled `AutomationFilters` is shared by cloud views and Desktop local
  schedules. Apply target/ownership constraints before name/status filters.
- `@raypx/core/jobs` owns platform-neutral local/cloud schemas, inferred types,
  errors and pure calendar calculations.
- `/server` owns injected cloud scheduling use cases and repository ports for Bun
  hosts. Persistence, identity, relay and clocks remain caller-owned.
- `/server/postgres` implements the account-owned PostgreSQL repository. API supplies
  its connection; migrations stay with Database. Injected `/server` never imports
  this concrete adapter.

## Boundaries

`/client` and `/server` import Core and never each other. No
entry imports contracts or concrete SDKs. Keep client ports independent of SDK-derived types.
Private view state remounts and in-flight requests abort on account/client changes.
Cloud forms retain edits on CAS errors and require explicit device epoch reselection.
Local automations remain in the Desktop device profile across account changes.

## Verification

Run package checks/tests and both application consumers. SQL persistence, actual
relay round trips and Bun/Nitro scheduled events have separate integration gates.

## Catalog ownership

Own `automations (local and cloud)` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Use JSON nested strings for every language and namespace. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.
