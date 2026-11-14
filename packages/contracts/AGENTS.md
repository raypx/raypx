# @raypx/contracts

`conversations` also exposes named group CRUD, Agent participation and optional
default-responder settings. Sends accept structural `mentions`; existing event
variants add optional Agent/parent-Run attribution. No stream version or public
Run-state/failure union changes accompany groups and delegation.

## Purpose

Pure transport schemas shared by their consumers. Task domain models and rules
belong to `@raypx/core`; transport adapters compose those same schema instances.

## Interface

`modelConnections.list/create/update/delete/test` is session-account scoped.
Credentials are input-only on create/update; metadata outputs never include a
secret reference. Model offers add connection/deployment source without endpoints.

`/api` composes `spaces.list/create` and `agents.create/list/get/update/delete`
from Core. They require a session, independently of deployment permissions. A
`spaceId` selects the requested resource; API resolves membership on every call.
Agent replies pair the Agent with its one direct Conversation.
`agents.models` reads the selected Space's offered model identifiers/display names;
the strict projection contains no provider connection or credential fields.
`conversations.send/events/snapshot` use the same session and Space admission.
`/api` also composes the version-1 conversation stream subscribe/ACK/unsubscribe
frames, transient reply prefix/delta frames and event/snapshot-required replies.
`conversations.stop` cancels a selected Run. Snapshots include Runs, reply segments
and optional bounded toolActivity/toolActivityTruncated fields. Tool lifecycle events
share toolCallId with approval cards and contain summaries/outcomes only.
`computers.get/start/stop` compose Core Computer state. `computers.listDirectory/readFile`
are bounded read-only workspace access. All use the same session/Space boundary;
file reads never start compute. Unconfigured, stopped and unavailable states are explicit.
`spaces.get/rename/delete/leave/members/updateMemberRole/removeMember` add backend
Space/member management; `spaces.*Invitation*`, `spaces.invitations` and
`spaces.cancelInvitations` add signed-in single-use invitation flows. Settings,
approval overrides, owner audit and ordered Space events use the same admission.
Only owner directory projections contain email. Invitation tokens are output only
when issued. Space stream subscribe/ACK/unsubscribe and `space.event` frames extend
`/events` without changing conversation payloads.
`approvals.pending/answer/settings/updateSettings/effects` compose backend Computer
approval schemas. Pending/answer/effects select a Space; settings use the session
account. Settings return their revision and mode availability; updates require
expectedRevision and return current settings on an explicit stale-edit conflict.
`approvals.effectiveMode` selects a Space and returns only the caller's effective
mode, override/account source and mode availability; it never returns rules.
Auto is accepted only to return explicit unavailability. Card events carry
bounded summaries and targets, never exact arguments or file/command content.
`/local-client`: renderer-safe methods and reply schemas; createLocalClient validates inputs and outputs, infers replies from the method and prevents caller-selected result generics. Native-only methods stay outside this client.

`/desktop`: bounded API request/reply DTOs, scoped execution list/result/terminal
restore queries and credential-free conversation stream open/read/send/close DTOs.
The latter transport the existing `/api` conversation frames unchanged.
`/desktop` also owns
the separate renderer channel's capability/authentication/request/ACK
frames. Native supplies ownership; query inputs cannot choose owner/origin/identity.
This entry never describes the
administrative daemon router. The daemon derives renderer local admission from
`/local-client` and API admission from `apiExposure`; no second business allowlist.

`/api` also defines the browser sign-in HTTP messages. `/desktop` defines the
renderer start/wait/cancel messages, which expose no callback or exchange secret.

`/api`: public HTTP account contract and native transport exposure policy (`apiExposure`).
Declare each procedure's consumer with `.meta(exposeApiTo(...))`. The daemon
derives Desktop RPC admission from the generated map. A missing declaration
omits the procedure from the map and fails the contract test.
Every API procedure declares account access with `rpcAccess(...)`: a permission
for protected procedures, `session` for any signed-in account and `public` for
procedures that accept anonymous calls. A missing declaration fails the contract test.
Add `rpcAudit(action)` to a mutation that needs an administration audit record;
the contract test requires it on every `configuration.update` procedure.
`/local`: versioned local CLI/Desktop protocol. There is no root entry and no
`./jobs` or `./memory` entry. Transport entries compose Core's domain schemas,
and domain consumers import Core directly.
Use the private `httpRead` builder beside a procedure's Zod schemas to opt it
into the versioned OpenAPI transport. Give it a resource path and use `{id}`
for a resource identifier. The remaining input fields become GET query parameters.
API uses that oRPC metadata for dispatch and spec generation.

## Ownership

Pure transport schemas shared by their consumers.

## Constraints

No network, environment, filesystem, database or framework implementations. The local protocol never becomes part of the public HTTP router. Local timestamps use ISO strings. Derive DTOs from exported Zod schemas.

## Verification

```sh
bun run --cwd packages/contracts check
bun run --cwd packages/contracts test
```

`/tasks` owns device projections, grants, relay envelopes and notification schemas.
Import task, decision and event models directly from Core.
`/api` adds scoped remote coordination; `/local` exposes private Agent-host methods.
Provider protocol envelopes never enter these public projections.
Core owns code-point-safe `taskText` clipping within UTF-16 schema budgets and
`normalizeTaskJson` for JSON persistence boundaries. The latter
replaces lone surrogates and NUL with the replacement character, preserving valid
Unicode pairs; use it on transport JSON, not non-JSON objects such as Date.
Relay schemas compose core models into commands, sequenced events, snapshots and cursor recovery.
Relay requires explicit protocolVersion 5 for managed tasks and observed requests.
Unsupported versions receive UPGRADE_REQUIRED without fallback. Full activity events are
authoritative checkpoints; activity_delta appends require an entry ID and adjacent
base/new revisions. Core's applyActivityEvent returns undefined when checkpoint recovery
is required. TaskChange scopes subscriptions to events, devices or resets.
Session attachment RPCs accept bounded UTF-8 file bytes and return an opaque
selection. Relay v5 carries the attachment source in the frozen context snapshot.
HTTP exposes projections and tickets; provider wire messages remain private to CLI.
`/terminal` defines observed-session, request, decision, capability and restricted
host-authorization schemas. `/api` exposes account-scoped observed summaries/details
and host bootstrap/grant/revoke. `/local` keeps host and connector methods private. Plain content is explicitly encoded;
request revision/epoch and decision receipts fence stale or duplicate answers.
Private `agents.local.*` methods require the reserved `LOCAL_WORKSPACE_ID` owner.
Device-profile work requires a registered instance, remains independent of online sessions, and Native preserves this ID.
Domain schemas and helpers are imported directly from Core.
They reuse normalized task/decision DTOs without publishing a local HTTP endpoint.
Local task detail also requires the Core `runStatus` projection; the persisted task
status remains unchanged and remote task detail keeps its existing contract.

`/api` also exports configuration DTOs and administrator RPC contracts. Public
settings are an explicit projection; write values reject unknown keys. No secrets.
`account.access` returns only the server-derived account ID, role and permissions,
including an explicit guest projection. Core's pure `/permissions` vocabulary
defines wire role/permission values; Auth's `/access` Better Auth ACL owns the role policy.
RPC inputs never accept roles or grants.

Relay v5 includes authoritative snapshot sync and frozen task contexts for every
host. `resume.syncId` and `snapshot.syncId` correlate backend-requested snapshots;
background recovery does not require a correlation ID. No capability negotiation
or partial-protocol mode is supported. Provider capabilities require `reason` and
`inputModes`; task detail replies always include `activity`, including an empty list.

Task creation accepts `contextSelection` references only; the internal relay command
carries an authoritative `context` snapshot.
Private `memory.*` IPC always addresses the device-profile library, accepts no
account ID, and uses the same version/CAS inputs as the account library.

`/api` composes `memory.*` from `@raypx/core/memory` document/version schemas.
Resolve accepts explicit revision references and a task target, with an optional
prompt for complete budget validation; the server derives the account from session.

`memory.delete` uses an expected revision and is available only for archived references.
Its acknowledgement is idempotent; accepted task snapshots remain separate.

Local terminal IPC uses registered-instance, online-session-free strict `approvals.local.*` schemas.
`terminal.open` accepts an omitted executable for host-selected default shells; its working directory
remains required, while `tools.run` retains the complete command schema.
Private `observed.settings/configure/list/get/decide` no longer exist. Public cloud HTTP
`observed.list/get`, relay `observed.decide`, and private `observed.remote` remain.
`host.terminal.*` is Native-only; it scopes cloud opt-in to origin/account.

`/api` composes `instances.*` enrollment, ownership and signed status contracts from `@raypx/instances`. Device polling and possession checks are host-only in native transport. Renderer-safe `instance.*` IPC returns status and a public enrollment code, never polling tokens or private keys. Native overwrites enrollment origin with its configured API origin.

Private agents.models.* exposes only non-secret catalog/default metadata. Pi continuation projections carry revision and blocked state. Remote managed Pi admission remains disabled.

`/api` composes Web administration overview, health and audit DTOs. `apiExposure`
explicitly marks these `web`, excluding them from native allowlists. Audit values
are a strict projection of supported roles and non-secret configuration; filters
have bounded strings and page sizes, with server-validated date windows and cursors.

`/api` also composes Space-scoped `routines.*` and `spaceMemory.*`, with session
admission and explicit renderer exposure. They do not replace retained `jobs.*`
or `memory.*`. Only routine create/update/rotation can return a freshly issued
key; list/get/history/events never return a credential or secret reference.

`conversations.createGroup/listGroups/getGroup/renameGroup/addGroupAgent/
removeGroupAgent/setGroupDefaultResponder/deleteGroup` expose named Space groups.
Member sends accept structural Agent mentions; existing outputs gain optional
Agent/parent attribution. No procedure accepts a member authority selector.

`/api` composes session-owned `pages.*`, `skills.*` and `mcpServers.*`. Page and
skill reads select a fresh Space; account skill/server availability and per-member
Agent selections never expose another member's resources. Only share creation
returns a token; server credential headers are input-only. Public document serving
is an independent HTTP route and never an API credential.

`conversations.history` adds bounded initial/older windows with a scoped message
boundary, separate from the event resume cursor. Existing snapshots keep their
full-history behavior and add optional bounded participants and resolved approvals.
