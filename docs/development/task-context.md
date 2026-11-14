# Space memory and retained task context

New Agent memory is Space-scoped PostgreSQL data. Web/Desktop open the memory
sheet from an Agent conversation header; it groups Agent and shared documents.
The old standalone account/device Memory pages are removed. Their procedures and
context-selection helpers remain for retained device/task consumers only.

## Agent and Space memory

`@raypx/core/space-memory` owns schemas and bounded recall rules;
`@raypx/memory/space-server` owns injected use cases and
`/space-server/postgres` owns persistence. API resolves fresh membership for every
`spaceMemory.*` request. `/model` owns editor state and ports; `/client` adapts
those ports for Web/Desktop. Mobile does not mount this editor.

Every edit, removal and restore creates an immutable full revision. Updates require
an expected revision; stale edits preserve the draft and require reloading current
state. Removal clears current text from future recall; restoration creates a new
revision from a selected historical one. Pinning and Agent/shared scope are explicit.
Provenance remains untrusted after restoration.

An Agent recalls its own and shared Space documents only. Recall prioritizes pins,
then newest revision and stable ID, selecting whole documents within the serialized
budget; overlarge documents are omitted rather than truncated. Optional semantic
ranking receives only eligible filtered candidates; no embedding service is installed.

A Run accepts the selected revision identities and exact attributed context into
its checkpoint before model access. Recovery reuses those bytes, never newer memory.
Physical source deletion removes relational pins without rewriting already accepted
checkpoint context. Recalled facts and prior outputs grant no permission.

Memory tool writes use the normal approval/effect path, current execution fence
and Run/tool-call mutation identity. They target the executing Agent; shared writes
additionally require its `allowSharedMemory` setting. Unknown effects remain blocked.
See [capabilities](../architecture/capabilities.md) for budgets and provenance.

## Retained account/device references

The older `memory.*` library stores reference documents and task templates:
account records in PostgreSQL `context_document`/`context_version`, device records
in an enrolled CLI profile's `profile.sqlite`. Device memory survives logout and
is never merged with or uploaded to an account. These sources are independent of
Agent/Space memory and are not recalled by new Runs.

Retained task/job inputs select document IDs and exact revisions. The authority
resolves current eligibility and immutable versions before accepting the task.
A missing, archived, moved or oversized source fails explicitly; it is never
silently dropped or replaced by current text. Core's exact formatter applies the
combined 32,000-character user/context budget and deterministic boundaries.
Context is reference text, never permission to bypass project grants or approvals.

Accepted tasks keep source names, versions, bodies, scope and capture time.
Retained remote control persists that snapshot with the command before dispatch;
matching retries reuse it. Changed input under one command ID conflicts. Unknown
delivery keeps a body-free digest receipt after its bounded replay body expires,
preventing an accidental resend. Cleanup compacts bodies, not unresolved receipts.
Historical snapshots survive source edits/deletion.

Local profile storage, device enrollment, retained cloud jobs and Relay v5 keep
their existing account/origin boundaries until replacement. Do not expose the
removed task editor, import this history into Spaces, or use an old device scope
to authorize server memory. [Local SQLite](local-sqlite.md) and
[server jobs](server-jobs.md) document remaining consumers.

## Verification

Memory unit/component suites cover revision conflicts, editing, provenance,
removal/restore and bounded recall. PostgreSQL modes test immutable versions,
scoping, fenced writes and checkpoint pins. Owned-backend browser journeys exercise
the current Space memory sheet. Retained context/CLI tests remain independent;
they do not establish new Agent-memory or packaged native acceptance.
