# ADR 0068: Give the API one public path prefix

Date: 2026-11-16

Status: Accepted. Supersedes the public transport path layout in [ADR 0066](0066-server-owned-agent-platform.md); execution and transport semantics remain unchanged.

## Context

A shared Web/API origin currently needs a gateway list for each API mount.
Missing entries have sent Page previews, public shares and attachment downloads
to Web. Adding a backend feature must not require another ingress prefix.

The current router has no immovable integration callback outside authentication.
Authentication already uses `/api/auth`; its callbacks and cookie attributes stay
unchanged. Discovery is the only protocol-mandated root location. No database or
schema change is required.

## Decision

All member, client and integration API routes live under `/api/`:

- `/api/auth/*` retains authentication and its callbacks.
- `/api/rpc/*` carries oRPC; `/api/v1/*` retains the versioned HTTP API.
- `/api/events` carries conversation SSE and Space/Screen WebSocket upgrades.
- `/api/routines/*` carries external routine deliveries and the email relay.
- `/api/device/*` carries native connector possession operations, including
  `/api/device/connect` for its outbound WebSocket.
- `/api/pages/member/:spaceId/:pageId` and `/api/pages/public/:token` serve Page
  documents. `/pages` remains the client workspace.
- `/api/attachments/*` serves member attachment downloads.
- `/api/openapi.json`, `/api/docs` and `/api/docs/assets/*` retain API documentation.

The closed root exception list is exactly:

- `/.well-known/openid-configuration` and
  `/.well-known/oauth-authorization-server`: standard discovery locations.
- `/health` and `/ready`: direct platform liveness/readiness probes. Gateways
  continue forwarding both publicly so platform checks and credential-free public
  deployment smoke observe the same API process. They expose no credentials.

Gateways match `/api/*` plus those four exact exceptions. Feature prefixes never
join the ingress contract. Source tests inspect the real composed routers,
including event routes and the Relay/worker surfaces, for this invariant. Local
production acceptance checks the built router and its behavior behind the same
minimal proxy rule. Public smoke checks prefix/exception forwarding, event Origin
admission, Page embedding policy and connector cookie stripping.

Relay retains its separate role and native-only `/api/device/*` ingress without
Auth, RPC, mail or migrations. The gateway handles `/api/device/connect` before
its general API matcher, strips Cookie and preserves Authorization. Combined
roles forward it to API; split deployments forward it to Relay. Other API routes
retain their cookies. Redis routing and PostgreSQL Run coordination do not change.

Page path changes do not change isolation. Session cookies retain their existing
root scope, needed by Web SSR; a path is not a security boundary. Member documents
still require fresh session/Space admission. The public document handler never
reads a session or Cookie and uses only its one-Page share token. Both document
routes strip Set-Cookie and retain no-store, nosniff, no-referrer, an opaque sandbox
without allow-same-origin, and frame-ancestors derived from trusted application
origins. HTML may run inline scripts within that sandbox; Markdown cannot run
scripts. API-wide framing denial must continue exempting precisely these document
routes. Proxies preserve their CSP and do not add a conflicting framing header.

## Consequences

This is a breaking server/client cutover. There are no aliases, redirects or dual
mounts. Existing public Page share links and routine webhook/email relay URLs stop
working. Operators must re-issue Page links with the new path, update external
webhook/repository delivery targets and email relay HTTP targets, and upgrade all
CLI connectors, Desktop and Mobile builds. Existing connector credentials need no
rotation solely for this change, but old binaries cannot connect. Old Web tabs
must reload. Authentication callbacks, invitation links, email addresses and
server-origin settings do not change.

Previously stored absolute member Page references stop matching and render as
plain text. New Ask about this Page references use `/api/pages/member`. No message
rewrite, stored-data migration or legacy parser is provided.

For a hosted shared-origin deployment, prepare matching gateway, API and Web
images and upgraded native/connector distributions first. Pause independent
autodeploys and enter maintenance. Replace the backend (and every split role),
wait for direct readiness, replace Web, then activate the matching gateway image
and verify through the public origin before reopening traffic. These three
artifacts are one release: sequential replacement has a failure window from the
first replacement until all three are active. Old clients fail against the new
API; a new gateway with an old API also cannot serve the new paths. Maintenance
must cover that entire window; rolling updates cannot provide compatibility.
Run public smoke, real login, conversation SSE, Space/Screen sockets, Page preview
and upgraded connector checks. Re-issue/update external URLs and reopen traffic.
Rollback restores all three previous images (and split roles) together; it does
not reset PostgreSQL or rewrite links. Probe paths and origins remain stable.
