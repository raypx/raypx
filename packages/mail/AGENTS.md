# @raypx/mail

## Purpose

Authentication email templates and Resend delivery.

## Interface

`/server`: createMailer and deterministic render/delivery support. `/types`: platform-independent Mailer structural interface.

## Ownership

Authentication email templates and Resend delivery.

## Constraints

Verification and password-reset mail only, in en/zh. Keep HTML and text together. Accept injected transports in tests. Never log addresses, credentials, tokens, URLs or bodies. Unconfigured delivery fails in every environment when a send is attempted. Creation remains available for startup/liveness. The factory exposes availability so API mail actions can fail before Better Auth dispatch.

## Verification

```sh
bun run --cwd packages/mail check
bun run --cwd packages/mail test
```
