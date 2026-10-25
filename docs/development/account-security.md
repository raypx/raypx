# Account settings and sessions

The Web account page supports editing the display name and reviewing active
sign-in sessions. These use the existing Better Auth endpoints; no schema change
or additional service is required.

- Name saves trim whitespace, retain drafts on failure and refresh the cached
  account projection after success.
- The current session is identified explicitly and cannot be revoked from its
  own list row. The existing Sign out action handles the current session.
- Other sessions can be signed out individually or together, after confirmation.
  Session management accepts any valid login (`freshAge: 0`), including sessions
  created more than 24 hours ago. Revocation still resolves an authoritative session.
- Lists are account-scoped component state. Session tokens never enter markup,
  persistent browser storage, query caches or diagnostics.
- A failed read keeps the refresh action available. A failed mutation retains
  its dialog for a deliberate retry, including an ambiguous network response.

Web component tests cover interaction, recovery and token visibility. Auth's
memory-adapter integration tests exercise real registration, verification, sign-in,
profile updates, ownership checks and revocation through the auth HTTP handler.
PostgreSQL and mail-provider checks remain separate deployment gates.

Task history also supports search and status, agent and computer filters. Filters
apply to the current cursor page. The UI states that scope and preserves pagination
when no tasks match. It does not download the entire history or change task data.

Name creation and updates trim whitespace and enforce 1–80 UTF-16 characters on
the server. Profile and session-revocation mutations require an exact trusted
Origin, including the native `views://main` origin; missing/external origins fail.
