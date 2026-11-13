# @raypx/auth

## Purpose

Account authentication, platform-specific session adapters and shared DOM forms.

## Interface

- `/server`: injected Better Auth factory and safe projection. Optional Google/GitHub
  credentials enable OAuth; `/api/auth/social-providers` exposes only enabled names.
- `/client`: browser `createAuthClient` and shared DOM `AuthForm` with injected
  authentication, query and navigation adapters.
  Pass `backLabel: null` to hide the form's back link when the app provides its own
  navigation. Applications can supply back-link text and verification/reset callback URLs.
  Applications own the outer panel, brand content and gutters. The shared form is
  at most 400px wide; `compact` reduces its internal spacing. All modes use 44px
  controls. Completion and expired-link states replace the fields with a status
  heading and the appropriate primary recovery or continuation action.
  Applications can supply `headingLeading` for brand content above the form title.
  Optional `socialLogin` supplies enabled providers and application-owned success/error
  callbacks. OAuth completion refreshes through `onSignedIn` without resubmitting login.
  Provider buttons use Google's and GitHub's Hugeicons through `@raypx/icons`.
  `completeOnMount` completes an application-confirmed session handoff, with the same
  retry lifecycle and no credential submission.
  `PasswordChangeDialog` takes a credential client, optional refresh callback and
  application-supplied password recovery link. `PasswordSetupEmail` sends the
  existing password reset link to the signed-in account's email address supplied
  by the application. Web chooses the action using Better Auth's linked accounts.
  Its compact settings action opens a modal; closing clears drafts and feedback,
  while in-flight password changes or refreshes prevent dismissal.
  Applications own where account settings are available.
- `/client/styles.css`: registers Tailwind sources for the shared DOM form.
- `/hooks`: platform-neutral React auth actions with an injected client, locale
  and Web callback origin.
- Pure session projections, provider identifiers and trusted-origin normalization
  come from `@raypx/core/auth`.
- `/policy`: pure name/password limits shared by endpoints and forms.
- `/access`: Better Auth's shared access controller and member/admin roles, built on
  Core's `/permissions` vocabulary. Auth imports the role names and permissions from
  `@raypx/core/permissions`; it never defines a second copy. The Admin plugin and
  permission projections consume this same ACL. Admin grants user list, get and
  set-role only; other account administration operations remain denied.

The server uses Better Auth OAuth Provider for the Desktop public client's code
and PKCE flow. Raypx binds the signed authorization request to its profile and
confirmed account, then exchanges the OAuth result for an independent native
session that retains the source authentication time.

## Ownership

Own authentication actions, safe request state and the shared DOM form's fields,
validation, translated feedback and layout. Applications own routes, client
instances, callback origins, query sources, navigation adapters and session data.

## Constraints

Do not import database, mail, remote client or application implementations. Require
verified email for password sign-in. Resolve sessions on the server for each RPC.
Keep account types free from credentials and retired product status fields. The
Admin plugin persists `member`/`admin` roles; multiple supported roles compose grants.
Missing/unknown assignments grant no remote access. `readAuthSession` reloads the
user record even with secondary session storage. Admin HTTP operations also check
the fresh verified, unbanned user's ACL before plugin dispatch. HTTP role changes cannot target the current user. Client role checks
are display hints only; mutations require a trusted Origin. Preserve synthetic
signup responses so Admin fields do not disclose account existence.
The injected host-revocation callback runs only after successful session-security
operations. Single-session revocation passes its ID; bulk revocation omits it.
Ordinary sign-out/expiry does not revoke independent host credentials.

Hooks own request status, safe error keys and duplicate-submit protection. Keep
success callbacks inside the busy lifecycle and distinguish their failures from
authentication or transport errors. Never retain credentials or server diagnostics
in hook state.
`retryCompletion` repeats only a successful action's failed follow-up. Credential
forms clear passwords on success and never resubmit them to recover a refresh.
Mail errors recognize HTTP 429 and expose only a parsed retry delay. Shared DOM
mail forms wait 60 seconds after success, or the server's retry delay after a limit;
ordinary failures remain retryable. Password fields show Caps Lock state and use
shared policy for new-password length feedback without retaining credentials.
The shared password field owns current/new/confirmation constraints. Forms derive
success copy from their mode and action outcome, translating notices during render.
`usePasswordChange` verifies the current password through the injected client and
keeps the password-change interface separate from sign-in clients. First password
setup uses the same expiring, single-use email link as password recovery.

Only the browser `/client` entry may reach DOM form components and browser i18n.
Keep `/hooks` platform-neutral and `/server` and `/types` free of DOM
imports. The form must not import a router or read browser globals during render;
applications provide links, callbacks and query data so Web SSR and Desktop hash
routing retain their own behavior.

## Verification

Auth owns its source-adjacent hooks and form component tests in a separate
happy-dom project; endpoint integration tests use the memory adapter under Bun.

```sh
bun run --cwd packages/auth check
bun run --cwd packages/auth test
```

## Catalog ownership

Own `auth` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Support TS literal objects or
JSON nested strings, one format per namespace/language. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.

- Web sign-in supports passkeys, Resend email codes and TOTP with backup codes. Keep profile-bound Host reauthorization on the Desktop OAuth flow and require a fresh browser session.
