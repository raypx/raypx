# Email

Package: `@raypx/email` ([AGENTS](../../../packages/email/AGENTS.md)). Verification and
password-reset mail in English and Chinese, delivered through Resend.

- `/server`: `createMailer`; `/types`: the `Mailer` interface auth receives.
- Configure `RESEND_API_KEY`, `MAIL_FROM` and optional `MAIL_DEFAULT_LOCALE` on API.
  Unconfigured sends fail with `MAIL_NOT_CONFIGURED`; they never claim delivery.
- Keep HTML and text bodies together. Tests inject an in-memory transport.
- Never log addresses, tokens, URLs or bodies.
- Only auth mail exists; there is no marketing or notification mail.
