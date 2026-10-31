# Memory, templates and task context

Web `/memory` manages account-owned reference documents. Desktop defaults to
**This computer**, available without login, with an account tab behind the same
remote login boundary as tasks. A document is project memory or a task template;
both have a name, category, text and optional device/project target. Templates
provide reusable task instructions as reference text and do not enable tools.

## Ownership and storage

Device documents live in `memory.sqlite` under the CLI profile, with the reserved
device-workspace owner. They survive login, logout, account switches and changes
to the remote service. No operation merges them with an account or uploads them.
The private `memory.*` IPC methods accept no account identifier.

Account documents live in PostgreSQL `context_document` and `context_version`.
Each RPC resolves its own current session; mutations also check Origin and account
rate limits. References and history are always filtered by the resolved account.
Project references require an authorized device/project. Revoked devices are
ineligible for new context resolution.

`@raypx/memory` owns schemas, injected library use cases and shared browser views.
API supplies PostgreSQL and project authorization; CLI supplies SQLite and local
authorization. Contracts composes the same schemas into separate account RPC and
private IPC entries. Core owns task context selections, immutable snapshots and
pure prompt composition. Browser-only ports stay in the client entry.

## Versions and retries

Creation retains a UUID until confirmed. Retrying that ID checks the immutable
first version and returns the current document without overwriting later edits.
Updates and archival use an expected revision and commit changed values atomically.
Unchanged updates keep the revision, while stale revisions still conflict. Conflicts
retain unsaved text. Restoring copies the selected content, name, type, category and
project into a new revision and preserves the current archive state. Unarchiving
has its own history reason; later versions remain in the timeline.

Archive keeps the document and its history, while preventing new task resolution.
The first release allows 100 documents per owner, including archived documents,
and 8,000 characters per document. Lists return summaries without bodies; history
loads at most 20 versions per page. Existing documents can be edited or restored.
Content-only edits work when the unchanged project is unavailable; assigning
another project still validates it. Creation retries recover the existing document
before checking whether a project remains available. Context UUIDs are canonical
lowercase; repositories require canonical stored keys and reject identity collisions.
Old noncanonical keys are neither migrated nor read as aliases.
PostgreSQL enforces global case-insensitive document-ID uniqueness with a `lower(id)`
expression index, which also bounds creation retry lookups to the matching key.

## Task selection and execution

Nothing is selected automatically. A task can explicitly select at most eight
document IDs and revisions. Changing its target clears the composer selection.
Drafts retain only those references, scoped to the same device/account workspace
as the rest of the draft. They never contain copied private reference bodies.

The API or local engine resolves the selected versions and checks both their
current location and historical project target. An archived, missing or moved
reference is an explicit error. References are never silently dropped, updated to
the newest version or truncated to make a task fit.

The combined user task and reference material has a 32,000-character budget.
Existing fixed host execution constraints are appended separately. Claude/Codex
receive the composed context on initial execution. A follow-up retains the parent's
snapshot for display but sends only the new prompt when resuming the same provider
session. Its budget applies to that new prompt. Both providers reject a resumed
session with a different ID as `SESSION_UNAVAILABLE`; Codex does so before sending
user input. Missing or rejected sessions fail without automatically starting a new
conversation or repeating inference. Reference bodies keep their original line
breaks, quotes and backslashes. Boundary tokens are selected deterministically and
checked against every source name/body and the user prompt, so source text cannot
forge a matching boundary and preflight uses the same budget as actual execution.

Tasks preserve the exact selected names, revisions, bodies, ownership scope and
capture time. Task details render that snapshot, even after its source changes or
is archived. Account task creation persists the first accepted snapshot in
`control_command` before dispatch and reuses it on a retry with the same ID and
request. Changed input under that ID conflicts. Device execution uses the same
durable receipt boundary and never resolves a cloud command against local memory.

Once an authoritative matching task projection arrives, the duplicate command
snapshot is removed. Subsequent retries return that task without sending another
host command. Pending command bodies have a 24-hour replay window and a per-account
limit of 4,096 entries and 8 MiB. Admission compacts excess bodies in bounded batches;
enabled maintenance also compacts expired bodies. Each pass handles at most 1,000
rows. Unknown delivery retains only a compact digest receipt, without the request
or reference text, and rejects later retries with `CONTEXT_REQUEST_EXPIRED` until an
authoritative task is available. These receipts preserve the no-replay guarantee.
They are deliberately not deleted by a simple TTL. Apply the generated partial
indexes before deploying the new cleanup and admission queries.

Host announcements and the server's viewer-ready frame advertise `contextSupported`.
Clients require an explicit server declaration on every connection; the server
also rejects a host without that capability with `UPGRADE_REQUIRED`. Context is reference data and
does not change project authorization, approval, cancellation or command policy.

## Scheduled Agent tasks

Cloud `agent.run` plans can pin the same document IDs and revisions. Each new run
resolves those versions again; editing a reference does not change a saved plan's
selection. Missing, archived, moved or oversized context fails the occurrence and
pauses the plan for user review. Unknown delivery retains the existing no-resend
policy. Archive confirmation lists the number of referencing cloud plans and a
bounded name/status preview. A failed usage lookup is explicitly unknown. Local
references never query cloud plans. Local command/directory schedules keep their
current device behavior.

## Verification

The default gate covers schemas, budget boundaries, versions, CAS conflicts,
ownership, account changes, draft restoration, native IPC restrictions, provider
prompt injection and relay capability negotiation. Real PostgreSQL tests cover
concurrent writes, immutable versions, retry IDs, quotas and reads without the
account write lock. Node integration exercises RPC and contextual task delivery.

Browser tests exercise both account pages, version restoration, explicit template
selection and unchanged historical task context after later source edits.
Packaged Native and real model execution remain separate platform gates.

Archived references can be permanently deleted with an expected revision. Deletion
atomically removes the source and all its versions and frees a document slot;
accepted task and command snapshots remain independent. A body-free deletion
receipt reserves the canonical ID and makes a matching deletion retry idempotent,
so an old pinned reference cannot resolve to a replacement document. API writes
still require the current account, trusted Origin and the memory mutation limit.
SQLite requires schema version 2, including device-owned deletion receipts.
Fresh databases initialize that format; older schemas are rejected without migration.

Task and cloud Agent-plan editors show the combined reference/prompt character
budget using Core's exact execution formatter. Selected immutable bodies are read
once per selection and kept only in component memory. Typing recomputes locally;
drafts still store only reference IDs/revisions. Pending/unknown and over-limit
budgets disable both button and form submission, with an explicit retry for read
failures. The runtime keeps its authoritative preflight check.
