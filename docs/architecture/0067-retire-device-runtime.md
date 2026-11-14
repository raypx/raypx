# ADR 0067: Retire device-owned execution

Date: 2026-11-14

Status: Accepted. Implements the retirement boundary in [ADR 0066](0066-server-owned-agent-platform.md).

## Decision

Server Runs and the outbound Space connector replace the earlier local task
harness, device schedules and memory, enrollment, Host credentials, remote
projections and v5 Relay transport. Remove their packages, public entries, routes,
tables, command families, terminal helper, deployment adapter, catalogs and tests.
Regenerate one unreleased PostgreSQL baseline. Import no earlier data and provide
no aliases or fallback execution path.

The CLI retains two independent capabilities: the outbound-only device connector,
and a private Desktop session daemon. The latter keeps bounded authenticated
native/renderer channels, encrypted cookies, selected-origin HTTP, browser sign-in
and server-event forwarding. It owns no model, task, schedule, approval or Space
state. Its dedicated `desktop-session.sqlite` contains only encrypted session rows;
it never opens `profile.sqlite`. Native OS key storage and Go's independent instance
lock/preferences remain. Removing these would break current Desktop startup and
sign-in; the connector has no replacement for them.

Redis remains optional for combined roles, where device frames route directly.
Split API/worker/Relay connector routing requires Redis. Optional shared session,
rate-limit and configuration caches also retain it. Durable Runs and conversation
fanout continue to use PostgreSQL.

## Consequences

The current CLI command families are `device` and the private Desktop `daemon`.
There is no offline Agent execution, local business database or terminal-hook
integration. Closing Desktop leaves server Runs and the connector independent.
The immutable CLI distribution uses format 2 and carries no terminal helper.

Device Screen, home transfer and unverified native platforms remain explicit
limits. Removing the earlier runtime does not claim those capabilities or a
packaged platform acceptance result.
