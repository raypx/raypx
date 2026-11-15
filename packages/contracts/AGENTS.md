# Wire contracts

Contracts composes Core domain schemas and owns transport definitions only.
Public /api contains current session/Space services. /client exposes the bounded
Desktop/native transport; local_request accepts only runtime.info. /device-connector
owns the versioned outbound protocol with strict bounded schemas. Current command
and screen effects retain account, Space and fence admission at their service.

No tasks, hosts, observed sessions, instances, account jobs/memory or
legacy attachment/Relay protocol entries exist. Provider credentials are write-only; supervisor addresses appear only in admitted
administrator configuration, never member lifecycle/Screen contracts. Device possession routes reject browser Origin; pairing and grants
require native consent. Selectors never confer Space access. Keep exact optional
properties, explicit exports and direct consumers. Run check/test and policy.

Device connector protocol 2 requires ephemeral protected environment/stdin delivery. Its value never joins payload identity or durable events; version 1 is rejected. Desktop IPC stays independently versioned.

The renderer contract adds messageAttachments upload/remove/download and
notifications list/read/viewed. Computer read requests accept an optional device
selector. Connector member-read frames are read-only and independent of Runs.

Public configuration includes non-secret bootstrap/setupTokenRequired/mailConfigured booleans. Web-only configuration.testMail sends to the acting administrator; admin.issuePasswordReset requires users.password.reset and durable user.password.reset-link audit. The reset response is a one-time bearer secret, never cache or log it.

Administrator-only configuration.sandbox/updateSandbox/testSandbox expose safe settings, a credential-presence boolean and bounded connection/mode classifications. Credentials are write-only; only administrators receive the saved URL. Space lifecycle adds PROVIDER_UNAVAILABLE through the existing availability reason.

configuration.setupStatus adds a renderer-safe administrator-only configuration.read
with strict empty input and exactly model/sandbox/mail booleans. It grants no Space
access and changes neither configuration.public nor any database schema.
