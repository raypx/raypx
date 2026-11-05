# Relay

Independent Node application for device/viewer WebSockets at `/relay`, health and
readiness. It uses `@raypx/control` public entries and never imports API source.
API owns login, ticket/grant issuance, HTTP read models and scheduled-job decisions.
Relay verifies tickets/grants against the shared PostgreSQL database and uses the
private Redis broker for API scheduling, revocation and cross-instance routing.
It owns no local execution, authentication cookies, mail transport or AUTH_SECRET.

Keep relay v4 fencing, origin checks, one-time tickets, bounded frames/backpressure,
replay acknowledgements and uncertain delivery intact. Use exact allowed origins;
native clients may omit Origin and still authenticate with a device credential.
Only explicit deployment environment variables select resources. Never log
credentials, message bodies, SQL or context content. Database migrations stay in API.

`vite.config.ts` registers VP tasks; `vite.app.config.ts` builds the Node entry.
Unit tests live beside source; `tests/integration` contains boundary suites, with injectable owned resources.
Run package check/test/build and root `pnpm run verify`. Live PostgreSQL/Redis and
Docker acceptance remain separate; never run against an operator database.
