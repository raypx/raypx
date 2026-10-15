# @raypx/auth

## Purpose

Account authentication and platform-specific session adapters.

## Interface

`/server`: injected Better Auth factory and safe projection. `/client`: browser React client. `/native`: Expo SecureStore client and live cookie headers. `/types`: pure public account/session types.

## Ownership

Account authentication and platform-specific session adapters.

## Constraints

Do not import db, mail, client or application implementations. Require verified email for password sign-in. Resolve sessions on the server for each RPC. Keep account types free from credentials and retired role/status requirements.

## Verification

```sh
bun run --cwd packages/auth check
bun run --cwd packages/auth test
```
