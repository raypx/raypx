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
