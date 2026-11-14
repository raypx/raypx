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

The member-readable effective approval-mode projection selects only the current
caller's account default or the Space override. It returns mode availability and
safe reason codes without private rules or other members' defaults. Stream
departure reasons are available only for the caller's retained membership;
unrelated Space selectors keep the generic refusal.

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
- Account connection secrets are readable only by their owner and Runs acting as
  that member. A Space owner can separately grant an HTTP API's credentialed
  operations to all or selected Agents in that Space; callers never receive the value.
- A webhook key and an invitation link are stored as digests.
- Rotating the wrapping key re-wraps data keys without rewriting secret values.

The implemented model secret store uses a fresh random data key for each supplied
credential. The existing configuration-center HKDF/AES-GCM cipher encrypts the
value and wraps its data key, binding both to the account and secret identity.
The default wrapping provider derives from the existing `APP_KEY`; an injected
key provider may use an external service. Internal `rewrap` changes only the
wrapped data key. It is an operator capability, with no account API procedure.
API and recovery workers must share the same `APP_KEY`. Relay needs none.

Only backend model/tool adapters and authorized connection tests decrypt values.
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

Agent-to-Agent messages keep the originating Run's member and are refused across
Spaces. Delegated children inherit the member and untrusted provenance, with
shared-memory access restricted by the parent's permission. Group participation
does not expose another member's connections. Cancellation and steering revisions
prevent a late child result from becoming fresh model input after supersession.

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

Phase 5 HTML Page responses use `sandbox allow-scripts` without `allow-same-origin`,
`default-src 'none'` and their existing inline-only script/style policy. Markdown
Page responses use `sandbox` without script permission, `script-src 'none'` and
`style-src` containing only the SHA-256 hash of the server's inline stylesheet.
Both kinds use data-only images, `connect-src 'none'`,
`frame-src 'none'`, `form-action 'none'`, `base-uri 'none'` and application-only frame
ancestors. Both document routes add nosniff, no-referrer and no-store and strip
Set-Cookie. Public serving never invokes authentication; share tokens authorize
only one Page. The ordinary API session/origin gates remain the only API admission.
Remote tool endpoints bind the validated DNS address to the socket lookup for
each request and revalidate redirects, preventing an unchecked second resolution.
Remote header values use the existing encrypted envelopes and never enter public
server projections, tool catalogs, effects, lifecycle events or checkpoints.

Space-owned HTTP API registration is an explicit owner grant to all or selected
Agents in that Space. Current members' Runs can use those configured operations;
they do not receive the credential. Only owners can import/edit/test/delete the
definition. Credential envelopes and selected-Agent references include same-Space
keys. Secret values are supplied only as backend headers, never as model
arguments, tool definitions or response metadata. Input/output guards refuse
credential echoes before durable lifecycle data or model continuation is stored.
The document fetch sends no API credential. Calls use the registered base URL
and admitted pinned address; model input cannot replace the host or headers, and
redirects are refused. API responses remain bounded untrusted input.
