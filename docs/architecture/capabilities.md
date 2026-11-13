# Routines, memory, pages and connections

These capabilities are consumers of the [domain model](domain.md),
[Run execution](execution.md) and [approvals](approvals.md). Each has a feature
package with model, server and client entries.

## Routines

A routine is a saved prompt that starts a Run for one Agent. It is a scheduled
prompt, not a workflow language.

- Triggers: a five-field Cron schedule with an IANA time zone, a keyed webhook, an
  authenticated inbound email, and a signed repository event.
- One occurrence starts one Run. A repeated delivery with the same idempotency key
  starts none.
- Recurring timer routines keep at most one pending catch-up Run. A later tick
  reuses it.
- A late Run is never skipped. A Run that starts at least 15 minutes late is told
  its due time and its actual time, and the run history shows the delay.
- A routine runs as its owner, with its owner's credentials and approval rules.
- Pause affects future automatic Runs. A manual test uses the same path.
- A webhook key is stored as a digest and can be rotated. Inbound payloads are
  untrusted input. See [approvals](approvals.md#untrusted-input).

## Memory

- A memory document has `agent` or `space` scope and a revision history.
- An Agent recalls only its own memory and memory shared in its Space. Memory
  never crosses Spaces.
- Shared scope is an explicit choice. It pools knowledge among the Agents of one
  Space.
- Memory is context, not permission. A recalled fact, an old reply or another
  Agent's message cannot change instructions or authorize an action.
- Speaker and source attribution are kept when available. Stored text is never
  marked as trusted because an Agent wrote it.
- Semantic search is an optional port. Without it, recall uses the documents the
  Agent's instructions select.
- Members can read, edit and remove memory. A removal is a new revision.

## Pages

- A page is a document or dashboard an Agent builds and maintains. It has versions.
- A page renders in a sandboxed frame with a restrictive content security policy.
  It cannot read the session or call the API as the member.
- A share link exposes one page. The server stores the link's hash. Revoking it
  makes the page unreadable on the next request.
- A routine can update a page. Members can open it full screen and ask the Agent
  about it.

## Connections

A connection belongs to the account that added it.

- **Model connections** hold an endpoint and a credential for Pi. Compatible
  providers use the shared connection settings and standard protocol capabilities.
- **App connections** use an optional connector port. A managed connector provider
  can supply a catalog. No connector is required.
- **MCP servers** are remote servers reached over HTTP. A local command server
  runs only inside a computer, or when a deployment administrator adds it.
- **OpenAPI tools** are generated from a document the member supplies.

Each Agent chooses which connections it uses. Availability decides what a Space
may touch; the Agent decides what it needs.

### Implemented model connections

`modelConnections.list/create/update/delete/test` manage only the session account's
connections. A connection stores a display name, an existing AI transport kind,
offered model identifiers and optional compatible endpoint/protocol settings.
Credentials are write-only: create requires `secret`; update replaces it only
when `secret` is supplied. Lists expose neither the secret nor its storage reference.
Compatible endpoints use the existing AI adapter's HTTPS/loopback and URL rules.

Availability defaults to `{ mode: "all" }`, including future Spaces; deliberate
narrowing uses `{ mode: "selected", spaceIds }`, including an empty selection.
Every selected Space must currently contain the owner. Membership or Space
deletion removes that selection, while the account's connection remains.
Deleting the account or connection cascades its encrypted secret and selections.

`agents.models` returns the caller's available choices with `source: "connection"`
or `"deployment"`, without endpoints or credentials. Member choices have opaque
IDs derived from connection identity and model identifier; clients retain
the returned `modelId` unchanged. A Run resolves as its initiating member, first
against that member's available connections and then the deployment catalog.
Its private connection pin covers identity, kind, endpoint, protocol and exact
model, excluding the credential, name and availability settings. Rotating only
the credential preserves recovery. Removing access, deleting a connection or
remapping its selected endpoint/model fails recovery with `CONNECTION_UNAVAILABLE`.

Testing performs one ten-second request with a one-token output budget and a
fixed prompt. It returns only `SUCCEEDED`, `AUTHENTICATION_FAILED`, `RATE_LIMITED`,
`TIMED_OUT`, `MODEL_UNAVAILABLE` or `REQUEST_FAILED`. No provider error is returned.
Construction performs no database writes or network requests.

## Skills

- A skill is reusable know-how in text. It needs no account and holds no
  credentials.
- Installing a skill or a plugin never runs third-party code in the backend. Parts
  that would, such as hooks or scripts, are not installed, and the product names
  what it left out.
- An Agent changes only skills that live in its own Space.

## Web access

Web search and fetch are optional ports. Fetched content is untrusted input and is
labeled as such in the model history.

## Phase 4 backend decisions

Space routines live in `@raypx/jobs/routines`, independently of the retained
account/device job procedures. `routines.*` resolves membership for every call;
create, update, pause, resume and key rotation make the editor the owner. Runs
already accepted retain their actor. A manual test can run a paused routine and
uses a required idempotency key. Pausing affects future automatic occurrences.
The worker starts schedule scans explicitly; runtime construction performs no I/O.
Routine row locks and durable occurrence/delivery keys serialize concurrent workers
and ingress. A queued, never-started scheduled Run is reused for catch-up; its
original due time remains pinned. After downtime, a scan represents the backlog
with its oldest due occurrence and advances the next tick beyond the scan time;
it does not create a burst of undiscovered historical Runs. History exposes each
recorded occurrence and its linked
Run, first start and delay. Routine events have their own ordered query,
`routines.events`, without adding conversation event variants.

Webhook keys are 32 random bytes, returned as hex once on creation or rotation;
only SHA-256 digests persist. JSON ingress is limited to 65,536 UTF-8 bytes, counted
while reading the stream. Each routine admits at most 60 new inbound deliveries
per 60-second window in PostgreSQL; authenticated retries return the stored
outcome before charging that window. The same delivery identity with different
bytes is refused. Webhooks require `Authorization: Bearer <key>` and
`Idempotency-Key`. Email uses a separately configured relay credential and
`ROUTINE_EMAIL_DOMAIN`; without the paired configuration, email triggers cannot
be created. The relay POSTs a normalized address, sender, message ID, text and
optional subject. Raypx does not run SMTP.

Repository requests use `X-Delivery-Id`, `X-Event-Kind` and
`X-Routine-Signature: sha256=<hex>`. Sign the UTF-8 bytes of
`deliveryId + "\n" + eventKind + "\n" + rawJsonBody` with HMAC-SHA-256. This binds
the deduplication identity and event filter to the body. The random per-routine
secret uses the same envelope encryption and key provider as model secrets, in a
Space/routine child of the secret store. Ownership transfer rewraps the value for
the new owner. No key, inbound body or saved prompt enters routine events or logs.
The public trigger message contains the saved prompt; the bounded inbound body
is private Run context, JSON framed and labelled untrusted.

Space memory lives in `@raypx/memory/space-server`; `spaceMemory.*` leaves the
retained `memory.*` account/device procedures unchanged. Memory revisions are
immutable full snapshots; removal writes a revision with no current text.
Restore copies an exact historical revision into a new revision, retaining its
untrusted provenance. Future recall excludes removals. A previously started Run
retains the context it already received, even if the document changes or is removed.
Default recall prioritizes explicit pins, then newest revision time and stable ID,
and includes whole documents within 8,000 UTF-16 code units including JSON framing
and attribution. A too-large document is omitted, not truncated. The optional
semantic ranking port works only on the already Space/Agent-filtered candidates
within the same pin groups and budget. No embedding service is configured.

`agent_memory_save` and `agent_memory_update` are change tools in the existing
approval/effect pipeline. They address the executing Agent's documents; shared
writes additionally require `Agent.allowSharedMemory` (default false). Their
Run/tool-call mutation identity prevents repeating a committed revision if effect
completion was interrupted. The memory write checks the execution fence under
the same transaction as its revision. Run-origin revisions record actor, Run and
untrusted-input provenance; member edits cannot retroactively authorize a Run.
Checkpoint pins store the selected document/revision pairs as scoped relational
references, separately from immutable formatted context in checkpoint JSON.
Recovery never recalls newer revisions. Logical removal preserves the revision
and pin. Physical source deletion clears its pin relations while preserving the
accepted context bytes.

The old account context documents, local memory library, device Cron and cloud
job projections remain solely for retained consumers. Retire those procedures,
clients, profile tables and cloud projection tables with their final consumers;
there is no import, compatibility alias or second Space authority.
