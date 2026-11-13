# ADR 0062 — Desktop sign-in in the system browser

Date: 2026-11-13

Status: Accepted. The authorization-code protocol is superseded by [ADR 0063](0063-desktop-oauth.md).

Desktop opens the configured Web deployment in the system browser for initial
account sign-in and online re-login. Web resolves the account through its
existing email/password and configured social sign-in methods. The confirmation
page identifies the computer and the signed-in account before approving the
request. An enrolled profile requires the account and API origin in its signed
binding.

The daemon opens a short-lived loopback HTTP listener for a single attempt and
registers its exact callback URI, state and S256 PKCE challenge with the selected
API. The renderer receives only the browser request identifier. The daemon
validates the loopback response and exchanges the single-use code with its
verifier over the selected API connection. Better Auth checks the source
session and issues a separate Desktop session. Pending requests and codes are
expiring verification records with atomic consumption. Credentials stay in the
daemon's existing encrypted session store. Cancellation, expiry and renderer
release close the listener.

The Desktop session carries the source Web authentication time so the exchange
cannot confer new freshness for remote Host authorization. Device enrollment
and explicit Host opt-in remain separate operations. The signed enrollment
still governs offline use. The existing Host reauthentication flow is outside
this change.
