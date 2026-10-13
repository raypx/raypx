# @raypx/mail

## Purpose

Authentication email composition and delivery. The package owns typed templates,
plain-text alternatives, and transport selection for API-owned auth flows.

## Interface

```text
src/env.ts       mail environment preset
src/types.ts     Mailer, template, transport, and message types
src/server.ts    createMailer and server-only template/transport exports
src/templates/   React Email templates and shared layout
src/transports/  Resend and logger transports
messages/        English and Chinese JSON catalogs
scripts/         local deterministic email preview
```

## Ownership

- Own verification, password reset, and welcome email content.
- Resolve injected mail configuration for every delivery. Use Resend when
  configured; use logger transport only in development/test.
- Production configuration errors occur at send time as `MailUnavailableError`;
  they never prevent application startup.
- Keep HTML and plain-text output together for every template.

## Constraints

- Task-notification templates and send methods are retired. Operational delivery
  logs retain counts and safe metadata,
  never recipient addresses or message content.

- Never log API keys, passwords, verification tokens, reset URLs, or rendered HTML.
- Do not expose Resend or server environment values to browser applications.
- Do not turn this into an arbitrary marketing-mail or task-notification API.
- Keep templates deterministic and network-free in tests and preview.
- Render subject, HTML, text, actions, and `<html lang>` with one locale:
  `input.locale` when the caller knows the recipient's language, otherwise
  `MAIL_DEFAULT_LOCALE`, itself falling back to `en`. Omit `locale` rather than
  passing `undefined` — the fallback depends on the property being absent
  (ADR-0005).
- Better Auth callbacks derive the recipient locale from the triggering request;
  mail sent without a request uses the configured default. Verification and reset
  templates share `templates/link.tsx`; the service shares configuration and delivery.

## Verification

```bash
bun run --cwd packages/mail check
bun run --cwd packages/mail test
bun run --cwd packages/mail preview:email
```
