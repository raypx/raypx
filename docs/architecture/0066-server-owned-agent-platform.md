# ADR 0066: Server-owned Agent platform

Date: 2026-11-13

Status: Accepted for the `next` branch. Replaces the ownership and runtime
decisions in ADRs 0035, 0037, 0039, 0040, 0041, 0044, 0052, 0053, 0054 and 0065,
whose text is removed here and remains in the history of `canary`. Extends
[ADR 0051](0051-backend-runtime-roles.md) with a `worker` role.

## Context

The earlier product gave each device the authority over its own work. The server
stored read projections and routed remote commands. That model keeps local work
private and offline, but an Agent stops when its computer is off, it cannot be
shared, and every client other than the owning device is a remote view.

The product goal has changed to persistent Agents that keep working, are the same
on every device, and can be shared in a Space. Reaching that goal from the device
model requires a second authority on the server and a protocol to reconcile the
two. A single server authority removes that problem.

## Decision

- PostgreSQL is the one authority for Agents, conversations, Runs, approvals and
  events. Clients express intent and render state.
- The product is organized around Agents and their conversations. A Space is the
  authorization boundary and can have members.
- Pi runs inside the backend's `api` and `worker` roles. A Run starts in the process
  that creates it and is owned through a fenced lease. A queue is a durable backup
  only.
- Tools execute in a computer behind one Computer port, with `docker`, hosted and
  `device` providers. The Agent runtime and all credentials stay outside it.
- A separate supervisor service alone holds the Docker socket.
- The CLI daemon becomes a device connector: an outbound-only computer provider
  for directories a member grants. It no longer owns Agent execution, history or
  scheduling.
- Every external service is optional behind a provider-neutral port. Vendor SDKs
  live only in adapters.

The [architecture guides](README.md) describe each part. The
[roadmap](../roadmap.md) gives the delivery order.

## Consequences

- An Agent keeps working with every client closed, and a shared Space has one
  history.
- Using the product requires a reachable server. Offline local execution is no
  longer a product capability.
- Conversation content, Run history and memory are stored on the server. A
  self-hosted deployment keeps them under the operator's control.
- The device profile SQLite store, instance enrollment, the daemon-owned Desktop
  channel and remote read projections are retired as their phases land.
- Sandbox computers need Docker or a hosted provider. A deployment without either
  still supports conversation and device computers.
- The toolchain, workspace boundaries, sign-in, UI system and release gates are
  unchanged.

## Rejected alternatives

- Keeping device authority and adding a linked server: two authorities need
  export, import and reconciliation before the first shared Agent works.
- Running the Agent runtime inside the sandbox: credentials and approvals would
  enter the place being isolated.
- A queue as the normal dispatch path: a slow or stuck job delays unrelated Runs.
- One SQLite store per Space on the server: it cannot support several backend
  processes or cross-Space account settings.
