# web

## Purpose

React and Vite SPA for account access and device preferences. This application is
an independent composition root and is never imported by another workspace.

## Interface

- `src/router.tsx` owns TanStack Router routes and navigation.
- `src/pages/` owns account, authentication and settings composition.
- `src/account.ts` creates Better Auth and remote oRPC clients.
- `src/main.tsx` mounts browser language and theme providers.
- `index.html` restores theme and language before first paint.

## Ownership

Web owns forms and navigation. Shared primitives and theme belong to UI;
translations and language preference adapters belong to i18n. Authentication is
provided by auth and remote behavior by client/contracts.

## Constraints

- No server runtime, TanStack Start, server functions or old business routes.
- Default API URL is the current origin; development proxies auth/RPC to port 3002.
- Verification and password reset links finish in Web.
- Persist preferences on this device independently of account sessions.
- Translate safe error codes. Never display arbitrary server diagnostic messages.
- Vite writes `dist`; Nitro copies it into the API deployment artifact.
- Keep independent test configuration so application plugins stay outside tests.

See [foundation architecture](../../docs/architecture/0034-extensible-foundation.md)
and [verification](../../docs/development/testing.md).

## Verification

```sh
bun run --cwd apps/web check
bun run --cwd apps/web test
bun run --cwd apps/web build
```
