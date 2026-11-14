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
- **MCP servers** are remote servers reached over HTTP. Backend command/stdio
  servers are refused; local command-server execution is not implemented here.
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

- A skill is reusable know-how in text, with no credentials or executable parts.
  Member skills are account-owned with Space availability. Agent-created skills
  belong only to their creation Space.
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

`routines.list` and `routines.get` add optional `ingress` metadata. Webhook and
repository entries return complete `/routines/:id/webhook` and
`/routines/:id/repository` URLs from the explicitly configured `AUTH_URL` origin;
the authentication localhost fallback is never advertised as public ingress.
An absent origin returns `url: null` with
`PUBLIC_API_ORIGIN_NOT_CONFIGURED`. Email returns the stored complete inbound
address when `ROUTINE_EMAIL_DOMAIN` is configured, or `address: null` with
`EMAIL_NOT_CONFIGURED`. A missing trigger returns `TRIGGER_NOT_CONFIGURED`.
Available entries have a null `unavailableReason`. These read projections never
return ingress keys, signing secrets or the relay credential. No new deployment
environment variable is required.

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

## Phase 5 backend decisions

Pages use `@raypx/pages/server` with immutable PostgreSQL snapshots, bounded to
256 KiB UTF-8 per version and 1,000 Pages per Space. Keeping these self-contained
text documents in PostgreSQL makes CAS, version creation, Run mutation deduplication
and the Space event one transaction; no object-storage asset lifecycle is introduced.
An edit, rename or restore requires `expectedVersion`; stale writes return
`PAGE_CONFLICT`. Restoring copies the selected title/kind/body into a new version.
Author provenance is historical context rather than current permission. Agent
writes are limited to Pages that Agent maintains and retain the normal approval
rules, including routine Runs. Tool writes accept at most 32,000 UTF-16 units and
reads page through bounded text slices.

Share creation returns 32 random bytes as hex once. Only SHA-256 hashes persist;
links may pin a version or follow the current one, expire, or be revoked individually
or together. Public requests read authoritative state each time, including claimed
Space deletion. Revoked, expired and invalid tokens share a not-found response.
`GET /page-content/public/:token` never reads an account session. The authenticated
`GET /page-content/member/:spaceId/:pageId?version=N` serves the same document and
headers after fresh membership admission. Both are read-only, no-store and cookie-free.
Markdown uses CommonMark/GFM with raw HTML disabled and allowlisted tags/protocols.
HTML keeps inline scripts/styles and data images under an opaque sandbox origin:
no same-origin, forms, frames, objects, external images/scripts or network access.
CSP frame ancestors are the configured application origins. Public admission is
120 requests per address/minute and 60 per token/minute; only digests enter limits.

Markdown documents include one self-contained neutral stylesheet for both member
frames and public shares. It uses the visual system's light/dark tokens, system
fonts and document measure, with `prefers-color-scheme` selecting dark mode.
Headings, lists, code, tables, quotes, links and images remain within the reading
column. The exact stylesheet bytes are authorized by a SHA-256 CSP hash;
Markdown permits no scripts, external assets or arbitrary inline styles. HTML
Page bodies and their existing sandbox policy remain unchanged. Self-contained
base64 PNG/JPEG/GIF/WebP images render under the existing data-only image policy;
SVG images and data links remain blocked.

Page write tools attach the server-produced Page identity and version to committed
tool activity. Live events, snapshots and bounded conversation history expose the
same optional nullable `page` metadata. Same-Space identity tombstones retain the
link after deletion without retaining the document body or granting access.
Web opens Page detail, Desktop retains its Web preview handoff, and Mobile hands
off to Web. Null identity opens the Pages list; stale IDs show a deleted state.

Skills use `@raypx/skills/server`. Account skills follow all/selected membership
availability, including future Spaces in all mode. Learned skills are separate
Space-local text records. Agent enablement is per member and Agent so sharing an
Agent cannot grant another member's account resources. Run start pins up to 32
enabled names/descriptions within 8,000 serialized units; body loads page through
bounded untrusted text. Save uses ordinary change approval, fenced persistence
and Run/tool-call deduplication. Logical removal retains learned-skill mutation
targets. Imports accept Markdown with name/description front matter or ZIP, bounded
to 2 MiB input, 512 KiB expanded and 128 entries. Only Markdown/text references
install; omitted executable/unsupported entries and executable front-matter fields
are named. Traversal, symlinks and other special files are rejected. Imports never
write extracted paths or execute package content.

Remote MCP servers are account-owned with the same all/selected availability and
per-member Agent selection. Credentials are write-only encrypted secret-store
children. The official TypeScript client SDK is loaded lazily by the providers
adapter, with DNS-pinned HTTP transport, bounded JSON/SSE responses, deadlines and
cancellation. Every request and redirect resolves/admit addresses anew; nonpublic
addresses are rejected except explicitly permitted loopback endpoints. Redirects
cannot change origin or forward credentials to another host. Backend stdio
configuration returns `MCP_STDIO_UNSUPPORTED`. Server testing returns stable codes
and tool names only. Recovery freezes tool metadata and endpoint fingerprints,
revalidates owner/membership/availability, and never stores credentials in pins.

Remote names are `mcp_<server UUID without hyphens>__<remote tool name>`, distinct
from the closed built-in name enum. All calls record effects and lifecycle events.
A read-only annotation grants read approval behavior only with an exact member
Allow; Block always wins. Other calls follow change policy, including untrusted
write rules. Completed effects replay their durable result without dispatching
again; uncertain external outcomes remain unknown and are never retried automatically.
Managed app connectors remain outside this backend slice.

### Space HTTP APIs

A Space owner registers an HTTP API with an explicit base URL and an OpenAPI
3.x document, pasted as JSON/YAML or fetched once. The
document is bounded to 256 KiB UTF-8, 128 operations, 16,000 traversed nodes and
24 document levels; request schemas have a separate 12-level bound. Only local
references and a bounded JSON-schema subset are supported. Unsupported schema
composition, remote references and header/cookie parameters are refused. The
document is data and never installs or executes code. Import with no selected
operations exposes no tools until the owner selects them.

`openApiServers.*` resolves fresh membership; list exposes safe metadata to current
members, while create/update/delete/test require the Space owner. Definitions,
selected operations, Agent availability
and encrypted credential children are stored under composite same-Space keys.
PostgreSQL retains the normalized validated operation/schema definition; the
source URL is fetched only on registration and is never a runtime dependency.
Availability is all Agents, including future Agents in that Space, or selected
Agent IDs. Unlike account-owned MCP resources, registration intentionally makes
the selected operations usable by those Agents for the Space's current members.
Changing the base URL or source document requires a new registration; operation
selection, name, credentials and availability can be edited. Connection testing
sends HEAD to the registered base URL; endpoints that refuse HEAD report a failed
test rather than probing an operation that could have effects.

The providers HTTP/OpenAPI adapter uses the same DNS-pinned resolver admission as
remote MCP. HTTPS is required except for explicit loopback development endpoints;
private/nonpublic DNS answers are refused. Document fetches use that same path
without sending the API credential. Operations append only their registered path
to the explicit base URL, regardless of document `servers` values. Model input
cannot supply headers or replace the host. Every redirect is refused. Requests
have a ten-second deadline and a 256 KiB response read bound; model results contain
at most 12,000 UTF-16 units and are labelled untrusted.

Names are `openapi_<server UUID without hyphens>__<operationId>`. Only selected
operations enter the frozen Run catalog; recovery checks the same definition
fingerprint and current Agent availability. Credentials use the existing encrypted
envelopes, remain write-only, and are absent from tool catalogs, checkpoints,
events, effects and logs. GET and HEAD have read approval behavior; every other
supported method is a change. Exact Allow/Block rules and untrusted-write policy
still apply. Every dispatch, including reads, records an effect intent/outcome and
tool lifecycle. Unknown effects are never retried automatically.

Web/Desktop's Tools settings manage APIs next to remote servers, with connection
testing, operation selection, credential replacement and confirmed deletion.
Mobile shows activity and addressed approval cards, including read/change labels;
management remains in Web/Desktop.

### Review model selection

Action review independently selects a deployment offer with
`APPROVAL_REVIEW_MODEL_ID`. It uses the same protected deployment credential map,
without borrowing another member's connection. Member model selection and shared
Space ownership do not grant reviewer configuration. No optional Space reviewer
model choice is exposed. See [automatic review](approvals.md#automatic-review).

Protected input supplies one sandbox command environment or one HTTP bearer
credential without entering model context. Normal approval remains independent;
remote MCP, device and file destinations are unsupported. See
[request lifecycle and disclosure boundary](protected-input.md).
