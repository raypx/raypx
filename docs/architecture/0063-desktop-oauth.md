# ADR 0063 — OAuth/OIDC for Desktop sign-in

Date: 2026-11-13

Status: Accepted. Supersedes the authorization-code protocol in [ADR 0062](0062-desktop-browser-sign-in.md).

Desktop uses Better Auth OAuth Provider for the OAuth authorization-code grant
with S256 PKCE and OpenID Connect. API registers one managed native public
client for Raypx Desktop. It permits only authorization-code grants and
loopback callbacks to the fixed path with an ephemeral port. The daemon keeps
its verifier and checks callback state and issuer. The provider owns code
issuance, consumption, PKCE, token signing and OIDC discovery.

Raypx binds each attempt to the configured Web origin, device label and the
existing profile account when applicable. Web reuses its login and presents
explicit confirmation for that account and computer. The daemon redeems the
OAuth code at the standard token endpoint. API consumes the approved attempt
and the matching OAuth access token, verifies the signed identity and original
Web session, then sets an independent Better Auth session cookie for Desktop.
The cookie's session retains the Web authentication time. The daemon keeps
credentials in its existing encrypted store and rechecks the profile binding
before installing the session. Device enrollment and Host reauthorization
retain their existing flows.

Deploy the foundation migration before serving the new API. The deployment
routes the issuer's well-known metadata to API. Registration of arbitrary
OAuth clients and OAuth refresh and client-credentials grants are disabled.
