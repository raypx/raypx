# Google and GitHub login

Web supports Google and GitHub OAuth through the API's Better Auth handler.
Email/password login remains available. Providers appear on login and signup only
when both of their credentials are configured; missing pairs fail API startup.
The public `GET /api/auth/social-providers` response contains enabled provider names
only. Credentials are API runtime settings, never `VITE_*` values or build arguments.

## Provider setup

Create separate applications for development and each deployed environment.

| Provider | API runtime variables                      | Authorized callback URL                |
| -------- | ------------------------------------------ | -------------------------------------- |
| Google   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `${AUTH_URL}/api/auth/callback/google` |
| GitHub   | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `${AUTH_URL}/api/auth/callback/github` |

`AUTH_URL` is the API's public origin; a gateway serving Web and API can use the
same public origin for both. Register the exact callback URL without a trailing
slash. For local development the callbacks are
`http://localhost:3002/api/auth/callback/google` and
`http://localhost:3002/api/auth/callback/github`.

In Google Cloud Console, configure the OAuth consent screen and create a **Web
application** OAuth client. Add the Web origin to authorized JavaScript origins
and the API callback to authorized redirect URIs. While the consent screen is in
testing, add the intended Google test users.

In GitHub developer settings, create an **OAuth App**. Set the homepage to the Web
origin and the authorization callback to the API callback. The built-in provider
requests the profile/email access needed for login, including private email.

Put the credentials in the API environment and restart API. Compose forwards all
four optional variables from its environment file. On Railway, configure them on
the API service. Leave both values empty to disable a provider. Keep the Web origin
in `ALLOWED_ORIGINS`; sibling Web/API subdomains also require the existing
`AUTH_DOMAIN` cookie setting so Web SSR can see the session.

## Behavior and boundaries

Better Auth handles authorization code exchange, state binding and sessions. Only
verified provider email can establish a session. New users follow the existing
registration switch and receive the member role. Verified existing accounts can
link by the same verified email; an unverified local account cannot be implicitly
linked. Provider names alone never bypass email verification.

Web returns through `/login?oauth=success` to refresh the account, recover any
visitor draft and resume the validated application destination. It opens
`/projects` by default. Cancelling authorization returns to login with a translated
error and preserves that destination. Completion failures can retry the session
refresh without repeating provider authorization. No task or approval executes
as a result of login.

The native Desktop and Expo login screens currently keep their existing
email/password flow. Their native session stores need a separate browser-to-native
session handoff before OAuth buttons can be enabled there; a browser session must
not be copied through URL parameters.

## Verification

Auth tests exercise both providers' authorization and callback routes using
mocked provider responses, including cancellation, email verification, registration
policy and untrusted callback rejection. Web route tests cover destination
preservation and completion. Real provider login additionally requires configured
OAuth applications and an interactive browser; mocked callbacks do not verify
provider console settings or live credentials.
