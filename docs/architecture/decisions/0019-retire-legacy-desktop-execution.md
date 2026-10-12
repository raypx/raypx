# ADR-0019: Retire legacy Desktop execution

## Status

Accepted, October 12, 2026. Native-host details are superseded by
[ADR-0020](0020-electrobun-desktop-host.md); retained Admin scope is superseded by
[ADR-0021](0021-retire-admin.md). Supersedes [ADR-0009](0009-pi-as-agent-runtime.md)
and [ADR-0015](0015-local-agent-workbench.md), and replaces the Desktop delivery
scope in [ADR-0016](0016-cloud-agent-platform.md). The cloud Pi runtime and
controlled business UI boundaries remain in force.

## Context

The cloud API and fresh database baseline do not compose the former device
runner or Project AgentRun adapters. Desktop still exposes an execution panel
for that protocol, bundles a Node/Pi process, and offers overview, Activity,
Devices and settings without connected services. These paths add maintenance
and packaging cost without completing a usable product flow.

Admin batch status changes repeat the existing single-user command, and its
CSV export runs entirely in the browser. Neither needs a backend protocol.
There are no published clients requiring the retired protocol.

## Decision

- Retain Web Search/Computer, Conversations, Tasks, delivery acceptance,
  Projects, notifications, usage and administration. Worker owns cloud Pi;
  the private execution Gateway and durable outbox remain required.
- Desktop becomes a lightweight cloud project and task management client.
  Navigation contains Projects and Settings; `/` redirects to `/projects`.
  Retain authentication, theme, language, window lifecycle and tray behavior.
- Remove Desktop local execution, device routing, directory authorization,
  overview, Activity, Devices and unconnected preferences. Retire the old
  `projects.agentRuns`, `devices` and `runner` contracts, Client `./runs`,
  local Provider interfaces and their exclusive implementation dependencies.
  Future Desktop cloud conversation UI requires a separate product decision.
- Native installers contain the renderer and Rust window/tray host, without
  Node/Pi resources. Tauri invokes the root `build:desktop` gate directly.
- Admin keeps filtered, paginated user reads and individual status changes.
  Remove selection, batch writes and CSV export. Retain its page/account store
  for pending writes, localized feedback and stale-result protection, along
  with server authorization, audit and administrator protections.
- Keep historical migrations and user-local journals, sessions and files.
  Do not migrate or delete them. The active database baseline is unchanged;
  removed RPC paths return the ordinary missing-route response with no shim.

## Consequences

Desktop no longer promises local AI or synchronization. Cloud execution still
uses Pi, RunGrants, budgets, owner fencing, private files and delivery review.
The obsolete local execution schemas are removed from source while historical
SQL remains reference material. Any future local runtime needs a new protocol,
ownership model and explicit data migration design.

Verification covers retired RPC absence, retained Project uploads and cloud
flows, individual Admin operations and lifetimes, Desktop routing/preferences,
Rust checks and native packaging.

## Follow-up

Revisit Desktop execution only when a real product use case justifies its
additional protocol, authorization, persistence and packaging costs.
