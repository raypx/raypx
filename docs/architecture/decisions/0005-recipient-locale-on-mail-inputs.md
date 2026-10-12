# ADR-0005: Recipient locale on mail inputs

## Status

Accepted

## Context

[ADR-0004](./0004-use-intl-static-catalogs.md) localized the mail templates and then
stated, deliberately, that "recipient locale is not added to mail method inputs";
every message rendered with the process-wide `MAIL_DEFAULT_LOCALE`.

In practice that made the localization unreachable. A reader browsing in `zh`
received verification, password-reset, and welcome mail in `en`, and the only
lever was an environment variable that would have inverted the problem for every
`en` reader. One deployment could serve exactly one language of mail, which is
the situation the catalogs existed to end.

No stored preference was required to fix it. Better Auth passes the triggering
`Request` as the second argument to `sendVerificationEmail`, `sendResetPassword`,
and `afterEmailVerification`, and `resolveRequestLocale` already negotiated a
locale from a cookie and `Accept-Language` for the web surface. The request that
asks for the mail is the best available evidence of the reader's language, and it
was being discarded.

## Decision

`SendLinkEmailInput` and `SendWelcomeEmailInput` carry an optional `locale`.
`createMailer` renders with `input.locale ?? MAIL_DEFAULT_LOCALE`, so the
environment variable becomes the fallback rather than the only source.

`apps/api/server/api` resolves that locale from the request Better Auth hands
each callback and omits the property when there is no request — omission, not
`undefined`, because `exactOptionalPropertyTypes` is on and the mailer's fallback
depends on absence. The same optional locale is accepted by the Admin test-mail
operation, so an operator can verify either supported catalog without changing
the process default.

This supersedes only the recipient-locale clause of ADR-0004. The current ADR-0004
decision uses the `@voidmix/i18n` facade with static JSON catalogs.

It does not add a locale column to the user record. A stored preference would
outrank a request header, and it needs the status-value treatment the repository
already requires: a literal union in `@voidmix/core`, a `z.enum` in
`@voidmix/contracts`, a `pgEnum` in `@voidmix/db`, and a migration.

## Consequences

Mail matches the language of the request that caused it, for the three flows
Better Auth triggers. Admin test mail uses the locale supplied by its request.
`apps/api/server/api` now depends on `@voidmix/i18n`, which is a same-tier
adapter dependency.

Mail sent without a triggering request — a future scheduled or administrative
notification — still falls back to `MAIL_DEFAULT_LOCALE`. A reader whose browser
negotiates a language they do not want gets mail in it, because no stored
preference outranks the header yet.

`packages/mail/src/service.test.ts` asserts a `zh` recipient receives the `zh`
subject and `<html lang="zh">`, and that omitting the locale falls back to the
configured default. `apps/api/server/api/auth/config.test.ts` asserts the
locale is forwarded, and that the property is absent rather than `undefined` when
none was resolved.

## Follow-up

Revisit when a reader needs mail in a language other than the one their browser
negotiates, or when mail is sent outside a request — a notification digest, an
administrative broadcast. Either forces the stored preference this record
declined to add.
