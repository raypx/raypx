# 0051 — One backend artifact with runtime roles

Status: Accepted

Date: 2026-11-10

## Decision

The Bun/Nitro backend in `apps/api` produces one immutable server artifact. Its
`SERVER_ROLE` is `api`, `relay`, or `both` (the default). Role selection happens
at startup, without rebuilding the artifact.

`both` composes the HTTP API and RelayHub in one process. Scheduling and device
revocation call the local hub directly. PostgreSQL is the only required external
service. Configuring Redis attaches the existing cluster adapter and shared caches;
an unavailable configured cluster fails readiness rather than silently falling back.

`api` exposes authentication and HTTP projections but no WebSocket peers. `relay`
exposes only Relay sockets and health/readiness. Both split roles require Redis
for private routing. Relay parses only database, broker and allowed-origin inputs;
it does not construct Auth, mail, cookies, scheduling or an instance signer, and
does not require an authentication secret. Migrations belong to API-enabled roles
or an explicit migration job.

Nitro owns the listener and lifecycle for every role. Relay retains first-frame
authentication, exact origin checks, frame/backpressure bounds and authoritative
PostgreSQL fencing. Native clients may omit Origin. Neither cookies nor HTTP
Authorization can authenticate a Relay connection.

The independent `infra/relay` application is removed. Compose defaults to Web,
the combined backend and PostgreSQL. Railway may run split roles from the same
backend Dockerfile. The optional Cloudflare ingress runs that artifact with the
relay role and verified TLS database/Redis endpoints. Provider configuration
never imports an application composition root.

## Consequences

Single-node development and self-hosting no longer require Redis or a second
backend process. Horizontal scaling retains the existing cluster protocol and
uncertain-delivery behavior. All roles are tested from the same production output;
role-specific readiness and private-route tests prevent an accidental auth server
on a relay-only deployment.
