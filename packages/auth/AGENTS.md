# @raypx/auth

## Purpose

Account authentication, platform-specific session adapters and shared DOM forms.

## Interface

- `/server`: injected Better Auth factory and safe projection.
- `/client`: browser `createAuthClient` and shared DOM `AuthForm` with injected
  authentication, query and navigation adapters.
  Optional back-link text and application-owned verification/reset callback URLs
  preserve Web return destinations; omitted values retain the Desktop defaults.
- `/client/styles.css`: registers Tailwind sources for the shared DOM form.
- `/hooks`: platform-neutral React auth actions with an injected client, locale
  and Web callback origin.
- `/types`: pure public account/session types.

## Ownership

Own authentication actions, safe request state and the shared DOM form's fields,
validation, translated feedback and layout. Applications own routes, client
instances, callback origins, query sources, navigation adapters and session data.

## Constraints

Do not import database, mail, remote client or application implementations. Require
verified email for password sign-in. Resolve sessions on the server for each RPC.
Keep account types free from credentials and retired role/status requirements.
The injected host-revocation callback runs only after successful session-security
operations. Single-session revocation passes its ID; bulk revocation omits it.
Ordinary sign-out/expiry does not revoke independent host credentials.

Hooks own request status, safe error keys and duplicate-submit protection. Keep
success callbacks inside the busy lifecycle and distinguish their failures from
authentication or transport errors. Never retain credentials or server diagnostics
in hook state.

Only the browser `/client` entry may reach DOM form components and browser i18n.
Keep `/hooks` platform-neutral and `/server` and `/types` free of DOM
imports. The form must not import a router or read browser globals during render;
applications provide links, callbacks and query data so Web SSR and Desktop hash
routing retain their own behavior.

## Verification

```sh
bun run --cwd packages/auth check
bun run --cwd packages/auth test
```
