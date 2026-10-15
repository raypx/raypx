# ADR-0021: Retire Admin and unused management interfaces

## Status

Accepted, October 12, 2026. Supersedes the retained Admin scope in
[ADR-0019](0019-retire-legacy-desktop-execution.md) and the administration details
of [ADR-0014](0014-domain-services-and-client-state.md) and
[ADR-0016](0016-cloud-agent-platform.md). The cloud product and lightweight
Electrobun Desktop boundaries remain in force.

The task-notification retention provision is superseded by
[ADR-0026](0026-direct-run-queue-and-retire-task-notifications.md).

## Context

The user authorized removal of the entire Admin product and other code without
real consumers. The directory, run inspection, account-wide operational usage
queries and management write interfaces add a second product surface. Their
specialized permissions, audit transactions and bootstrap commands exist only
to support that surface.

Old settings mutations have only self-tests as consumers; runtime Auth and Mail
use the read resolvers. The old repository seed creates profiles without login
credentials. Two historical schema modules reference only one another and are
absent from the active database baseline.

## Decision

- Remove Admin pages, navigation, catalogs, role badges, stores and specialized
  browser coverage. Remove `admin.users`, `admin.audit`, `cloud.admin` and their
  contracts, handlers, queries, permission grants, application workflows and
  repository implementations. Retired RPCs return the ordinary missing route.
- Remove `admin:create` and `db:seed`, their exclusive environment fields,
  fixtures, dependencies and command adapters. Real authenticated E2E fixture
  seeding remains guarded and independent.
- Remove unused settings write ports, mutations and audit-construction helpers.
  Preserve current database-backed Auth policy and Mail configuration reads,
  their fixed keys, environment fallbacks and mail-dependent availability guards.
- Preserve account authentication, suspended-account denial, current project
  capabilities, private cloud execution Gateway, delivery review, notifications
  and each account's usage. No global role grants access to another account's
  cloud content. Session role values remain compatible with stored accounts.
- Remove the two isolated historical schema source modules and their exclusive
  enums. Keep the active Cloud baseline, compatibility columns/tables, existing
  data and every historical SQL artifact. No migration or data cleanup is added.
- Remove dependencies and error/catalog entries only after confirming their
  consumers disappeared. Native build entries, private Worker runners, active
  PostgreSQL tests and transitive toolchain overrides remain real consumers.

## Consequences

There is no current Admin surface or management permission system. Database
roles, status and audit/configuration tables can remain as compatibility data
without reviving a management API. Future administration requires a new product
decision and explicit authorization model.

Verification covers retired RPC absence for anonymous and every stored role,
real account isolation, current status denial, project/Cloud flows, runtime
artifacts and schema generation without drift. Test configurations resolve four
known Cloud helper sources directly so unrelated compiler output cannot replace
the code being verified.

## Follow-up

Any future physical removal of compatibility data requires its own explicit
migration and retention decision.
