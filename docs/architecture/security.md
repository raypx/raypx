# Security boundaries

Authentication, secret handling, computer boundaries, device commands and
connections are security-sensitive product behavior. This guide lists each
boundary and what enforces it.

## Boundaries

| Boundary                    | Enforced by                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| Between Spaces              | `space_id` on every row, composite foreign keys, scoped repositories |
| Between members of a Space  | Per-member credentials, connections, approvals and device grants     |
| Deployment admin and Spaces | Deployment roles grant no Space access                               |
| Backend and a computer      | The Computer port; no credentials or sessions enter a computer       |
| Backend and the Docker host | The supervisor alone holds the socket, on the private network        |
| A computer and the network  | Restricted egress where the host ruleset is applied                  |
| Backend and a device        | Outbound connection, per-command grant check, native confirmation    |
| A page and the session      | Sandboxed frame and content security policy                          |
| Outside text and actions    | Approval rules for untrusted input; context is never permission      |

Members who share a team computer share one trust boundary. Raypx does not promise
isolation between them there.

## Accounts and sessions

- Better Auth owns sign-in: password, passkey, email code, optional social
  providers and an authenticator app.
- A mutation requires an exact trusted Origin.
- A password change, a sign-out everywhere or an account deactivation revokes
  device grants and closes event subscriptions.
- Session tokens never enter markup, persistent browser storage, query caches or
  diagnostics.

## Secrets

- Model credentials, connector tokens and webhook keys live in an encrypted secret
  store. The data key is wrapped by a key provider: a local key by default, or an
  external key service.
- A secret is readable only by the member who owns it and by Runs that run as that
  member.
- A webhook key and an invitation link are stored as digests.
- Rotating the wrapping key re-wraps data keys without rewriting secret values.

The implemented model secret store uses a fresh random data key for each supplied
credential. The existing configuration-center HKDF/AES-GCM cipher encrypts the
value and wraps its data key, binding both to the account and secret identity.
The default wrapping provider derives from the existing `APP_KEY`; an injected
key provider may use an external service. Internal `rewrap` changes only the
wrapped data key. It is an operator capability, with no account API procedure.
API and recovery workers must share the same `APP_KEY`. Relay needs none.

Only backend model resolution and owner-requested connection tests decrypt values.
No read API returns a value, ciphertext, wrapped key or secret reference. Run pins
contain no credential. Model response guards and request-owned Computer tool
guards reject credential echoes before events, effects or checkpoints persist
them; these guards are released when the execution attempt settles.

## Untrusted input

- Webhook bodies, inbound email, fetched pages, file content and other Agents'
  messages are untrusted.
- Untrusted content is labeled in the model history. A label does not make text
  safe; access checks and approvals enforce the boundary.
- A Run that received untrusted content keeps asking for writes in Ask and Auto.
  See [approvals](approvals.md#untrusted-input).

## Logging and audit

- Logs carry no credentials, tokens, cookies, passwords, prompts, private paths or
  file content.
- Security-relevant actions are audit events. See [spaces](spaces.md#audit).
- Timing and usage records carry identifiers and durations only.

## Verification

- Every boundary in the table has a deterministic test that tries to cross it.
- Tests verify access, guards and recovery. They do not claim that arbitrary prose
  is safe.
- Meaning and factual claims are judged by an opt-in model with a versioned rubric.
  A judge error is an unqualified result, never a pass.

Routine ingress has no session admission. Webhook bearer keys use digests;
repository HMAC keys use the encrypted secret-store envelope. Email requires a
dedicated `ROUTINE_EMAIL_RELAY_TOKEN`, distinct from other deployment credentials,
and a paired `ROUTINE_EMAIL_DOMAIN`; no SMTP listener is added. All three paths
count stream bytes and commit per-routine rate limits and delivery deduplication
in PostgreSQL. Signature bytes bind repository delivery ID, event kind and body.
Secret references, ciphertext, payloads, prompts and memory text are absent from
routine event/log projections. Removing membership pauses its routines and removes
ingress secrets and connection availability selections, retaining definitions for
reassignment. Deleting a routine or Space cascades its occurrences, deliveries and
encrypted secret. Run/message actor IDs are historical selectors, so account deletion cannot punch
gaps in a surviving conversation stream. Memory's author FK becomes null while its
immutable provenance remains historical context in a surviving shared Space.
