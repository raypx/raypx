# @raypx/auth

## Purpose

The identity vocabulary shared by session resolution and application consumers.
It defines persisted account roles and the authenticated session shape.

## Interface

| Path | Purpose                                       |
| ---- | --------------------------------------------- |
| `.`  | `roles`, `Role`, `SessionUser`, and `Session` |

## Ownership

- Own the closed set of persisted account roles and the shape of a session.
- Own no session resolution or permission enforcement. API resolves sessions;
  Application rechecks live account state and resource access.

## Constraints

- **Zero dependencies.** API and renderers consume session shapes; keep provider
  implementation and resource authorization outside this vocabulary.
- `roles` is an `as const` tuple and `Role` derives from it. Existing
  `admin`/`owner` values remain compatible with stored accounts and sessions;
  they do not grant a global administration surface.
- Do not restore retired Admin permission strings or a grant table.
- Do not add session storage, token parsing, cookie handling, or an identity
  provider client. API owns those behind its `SessionResolver` seam.
- Session expiry remains a native `Date`.

## Verification

```bash
bun run --cwd packages/auth check
bun run --cwd packages/auth test
bun run --cwd apps/api test   # session admission and private resource access
```
