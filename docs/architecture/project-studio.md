# Project Studio migration

> Status: approved migration plan, partially implemented. The current committed
> baseline is `fff2141218a5570cd83a69792ea3d4956ee1ced6` (`feat: complete
project studio preview migration`), reviewed on September 9, 2026. The
> working tree also contains uncommitted implementation changes; this document
> labels those separately and does not treat them as released behavior.

This document is the handoff and execution plan for changing Voidmix from a
Workspace-led collaboration product into a project-first studio for individual
creators. It records the target product, migration order, current implementation
state, and acceptance criteria. The existing architecture documents describe
the running system until each phase below lands.

## Product decision

Voidmix becomes a **Project Studio** that helps a creator move from an idea to a
finished delivery:

```text
idea or brief -> material -> AI assistance -> review -> delivery
```

The primary user is an individual creator. Collaboration remains optional and
project-scoped so it can be enabled later without redesigning the project model.
The product UI does not ask users to choose or understand a Workspace.

Workspace remains an internal tenancy and authorization boundary during this
migration. Removing or renaming that backend boundary is not part of the UI
migration and requires a separate domain and security decision. User-facing
view models, routes, copy, and navigation use Account, Project, Library, and
Studio terminology.

## Target experience

### Information architecture

Web and Desktop share these primary destinations:

```text
Home
Projects
Library
Activity
Settings
```

- **Home** resumes recent work, shows items needing review, and starts a brief.
- **Projects** lists active and archived projects with stage filters.
- **Library** contains assets, versions, references, briefs, and search.
- **Activity** is a chronological account-wide record.
- **Settings** contains account, AI, notification, sync, and device settings.

Devices moves under Settings and system status. It is not a primary product
destination. A user who signs in lands on Home without a Workspace selection
step. During the preview period, public product routes remain explicitly marked
as preview data; the entire route group moves behind the existing authenticated
layout when the live account adapter is introduced.

### Project structure

A project is the primary creative-work entity and exposes these stable sections:

```text
Overview | Brief | Canvas | Tasks | Feedback | Activity | Settings
```

Files are available in Canvas and in the account-wide Library. Pi is available
through the global composer and contextual actions; it is not a primary Project
navigation tab. A standalone session detail route remains the deep-link and
recovery surface during migration, and existing Pi session URLs remain valid.

Each project carries:

- title, description, cover and visual thumbnail;
- stage: `draft`, `in_progress`, `review`, or `delivered`;
- computed progress, deadline and last activity;
- brief and project context used by Pi;
- assets and immutable asset versions;
- feedback and review state;
- Pi sessions and generated artifacts;
- optional project members and roles.

Archive state is independent from creative stage. Archiving must not rewrite a
project's last stage.

### Pi behavior

`CommandComposer` is the single entry component for AI work.

- On Home, submitting a prompt creates a brief flow and asks for a project only
  when the command cannot be attached to an existing one.
- Inside a project, the composer receives the project, brief, selected assets,
  tasks, feedback, and previous session identifiers as explicit context.
- Task actions can create a checklist, summarize feedback, or split work.
- Asset actions can summarize content, compare versions, and prepare a review.
- The target live behavior creates a `PiSession` for every durable run;
  mutations are visible, cancellable, and recoverable. Preview and remote
  adapters share the view shape. The current API runtime now has Pi session
  create/get/cancel/retry service paths and durable session repository wiring;
  complete Agent execution and progress delivery remain release work.

## Visual system

The visual direction combines Aura's presentation quality with the component
discipline of Shadcn UI Kit. It should feel like a polished creative product,
not a generic administration dashboard.

- Use a warm light field near `#f7f7f5`, white working surfaces, quiet borders,
  and a near-black inverted surface for the primary action.
- Use 10–14px card radii, 8px control radii, and restrained shadows. Working
  screens rely on hierarchy and borders; the Home hero may use a soft mesh,
  grid, or glow.
- Use Bento composition on Home and predictable, denser composition inside a
  project.
- State always includes text or an icon. Color is supporting information.
- Motion communicates entry, progress, focus, expansion, or completion and
  respects `prefers-reduced-motion`.
- Both themes, keyboard focus, 390px layouts, and WCAG 2.2 AA contrast are part
  of component acceptance, not a later polish pass.

Reusable primitives belong in `@voidmix/ui` only after two application surfaces
need the same interface. Product-specific composition remains in its app.
The planned vocabulary is `ProjectCard`, `ProjectStageBadge`, `MetricCard`,
`CommandComposer`, `QuickActionCard`, `ActivityTimeline`, `ReviewSummary`,
`FilePreviewCard`, `ProgressRail`, `FilterBar`, `CommandMenu`, `EmptyState`, and
`ProjectHeader`.

## Data and compatibility

The first live boundary is an account-scoped Project Studio snapshot containing
account profile, projects, project members, assets and versions, reviews,
activities, and Pi sessions. Contracts live in `@voidmix/contracts`; Web and
Desktop access them through `@voidmix/client`. Domain rules stay in
`@voidmix/core`, and persistence remains behind core-owned repository ports.
The current snapshot implementation returns up to 100 project summaries,
review attention, recent activity, and active session summaries when the
corresponding repositories are configured. Review, Feedback, Activity, and
Pi-session service paths are now wired; the remaining gaps are called out in
the implementation audit below.

The browser preview moves from `WorkspaceDataSource` / `WorkspaceSnapshot` to
`ProjectStudioDataSource` / `StudioSnapshot`. Introduce preview schema version 2
under `voidmix.project-studio.preview.v2` and migrate
`voidmix.workspace.preview.v1` once. Preserve projects, tasks, activity, and
sessions; derive missing stage, cover, deadline, asset, and review fields from
documented defaults. A failed migration keeps the old value intact and starts a
labelled fresh preview rather than partially restoring data.

Until each live capability exists, adapters must remain honest about preview
state. A network failure must not silently replace account data with successful
sample data.

## Decisions to lock before implementation

The following decisions are part of the migration seam. Leaving them implicit
will make the Web preview, Desktop client, API contracts, and database model
drift apart.

New choices in this section and the model/runbook below are proposed execution
defaults, not additional approved product decisions. Before implementing an
affected boundary, record accepted cross-layer choices in a
[decision record](./decisions/README.md). The existing architecture remains in
force until that change lands.

| Decision                                    | Proposed direction                                                         | Must be settled before            |
| ------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Project ownership and account aggregation   | Workspace-owned projects; account queries aggregate authorized memberships | Phase 1 contracts and persistence |
| Default tenancy and membership provisioning | Server resolves a creation context without a Workspace chooser             | First live project creation       |
| ProjectMember permissions                   | Optional project grants constrained by existing Workspace access           | Shared project access             |
| PiSession and AgentRun                      | One session projection per durable run attempt                             | Live Pi commands                  |
| Desktop offline scope                       | Retain the existing online-only boundary                                   | Settings and device controls      |

### Account, Workspace, and access

- Account is the signed-in user (`users.id` in the current model), not a second
  storage tenancy. Workspace remains the authorization boundary. A Project is
  canonically owned by one Workspace through a required `workspaceId`, while
  `ownerId` records its creator/owner for compatibility and attribution. Assets,
  versions, reviews, activities, and Agent runs follow the same Workspace
  boundary unless an explicit association says otherwise.
- An account's visible Project Studio projection is the union of Projects in
  its active Workspace memberships. The current service performs that union
  when both `WorkspaceMembershipRepository.listByUser` and
  `ProjectRepository.listByWorkspace` are wired; its compatibility fallback is
  the older `ProjectRepository.list(ownerId)` creator filter. The fallback is
  not sufficient for the live multi-Workspace contract and must be removed or
  made an explicit legacy mode before release.
- Project creation accepts an optional `workspaceId`. When omitted, the
  service chooses the first active writable membership by creation time and
  Workspace id; when supplied, the API checks that the signed-in user has
  active write access to it. The client value is only a selection; it never
  grants access. The target product still avoids a
  Workspace chooser on Home, so the live creation flow must define a server
  default: an account preference, then a deterministic writable membership
  fallback, with an explicit provisioning or access-denied result when none
  exists. That default is planned, not implemented by the current contract.
- Existing mutations resolve the Workspace from the stored Project before
  updating, archiving, restoring, reading tasks, or starting related work.
  API handlers perform the final `WorkspaceMembership` read/write check and
  return stable `UNAUTHORIZED` or `FORBIDDEN` errors. Cross-Workspace reads,
  writes, batch results, and removed memberships require denial tests.
- `ProjectMember` has a Core model, memory/PostgreSQL repositories, detail
  projection, add/update/remove procedures, and grant-aware service checks.
  A missing project grant preserves the Workspace owner's/editor's access;
  an explicit project grant can narrow that access, and every grant remains
  subordinate to active Workspace membership. The permission matrix
  must cover read, create, edit, archive, restore, asset version commit,
  feedback, review approval, and Pi actions for Workspace and project roles.

### Project lifecycle and projections

- Store creative `stage` separately from archive state. The current database
  columns are `stage`, `archived`, `archivedAt`, and `previousStage`; archiving
  records the current stage and timestamp, and restoring returns to that stage
  and clears the archive marker. An archived project cannot change stage until
  it is restored.
- Progress is completed tasks divided by all tasks, with `null` for a project
  without tasks. Stage changes are explicit and do not follow task counts:
  `draft -> in_progress -> review -> delivered`; `review` and `delivered` can
  return to `in_progress` only through an explicit reopen action. The Core
  lifecycle helper enforces these transitions; the Home metrics and Project
  header must use the same projection. Deadlines are nullable native `Date`
  instants stored in UTC and displayed in the selected account time zone; the
  time-zone display rule is a live UI requirement, not a preview guarantee.
- Keep the legacy status mapping at the adapter boundary. `active` and
  `paused` map to `in_progress`, `completed` maps to `delivered`, and
  `archived` maps to `draft` plus `archived: true` when no historical stage is
  available. The archived fallback is marked `stageWasDefaulted`; it must not
  be presented as inferred history.
- The Project Studio contract uses `title` as the canonical project field. The
  current core `name` field is a migration-era compatibility field and must be
  mapped at the adapter boundary before the live contract lands. Cover,
  thumbnail, deadline, brief, and project association also need one source of
  truth and explicit nullability.

### Assets, blobs, and Desktop sync

- Define the blob port separately from asset metadata: upload/download method,
  content type and size limits, checksum verification, failed-upload cleanup,
  and version retention. An asset version must remain immutable after commit.
- Define whether an asset belongs to one project, many projects, or a Library
  with project references. The answer affects deletion, search, permissions,
  and the Project Canvas model.
- The first Project Studio release remains cloud-backed and online-only. Sync
  settings expose connection and last-sync status; they do not imply offline
  editing. Offline manifests, cursors, tombstones, and offline conflict
  recovery require a separate decision. Device registration/revocation and
  notification delivery need their own authenticated contracts before those
  controls become interactive; offline sync is not a prerequisite for revocation.

### Pi sessions and durable runs

- `PiSession` is the user-facing projection of an `AgentRun` in the first live
  release. The session owns prompt, context, and presentation metadata; the run
  owns durable status, steps, cancellation, leases, and retry. Artifacts link to
  the session and the resulting Project or Asset version.
- Reuse the existing AgentRun state machine, including
  `waiting_for_approval` and `succeeded`, and map display labels at the adapter
  boundary. A user retry creates a new attempt linked to its predecessor;
  transport replay of the same command reuses its idempotency key. Cancellation
  is a server request with a durable outcome, not merely a disconnected stream.
  Committed effects remain visible; undo is a separate authorized command.
- Define how progress and partial results reach Web and Desktop, how a
  generated artifact is attached to a project or asset version, and what happens
  when the client disconnects while a run continues. A local preview runner
  cannot be treated as evidence for these server guarantees.

### Activity, audit, and query shape

- User-facing Activity is a product timeline with account and project scopes;
  Admin audit records remain the durable security record. Define which domain
  changes create each record, their actor and visibility rules, retention, and
  ordering when events share a timestamp.
- Define pagination and filtering for Library and Activity before the snapshot
  grows beyond preview data. The aggregate Home query can stay small, but it
  must not become the only way to retrieve projects, assets, versions, or runs.
- Specify the live adapter's error mapping for authentication, membership
  denial, stale version heads, unavailable blobs, cancelled runs, and temporary
  service failure. Every error must remain visible to the user and must never
  turn into sample data.

### Migration and rollout

- Preview schema version 2 needs an explicit old-to-new field map, an idempotent
  migration marker, and fixtures for valid, malformed, partially migrated, and
  currently running session data. Keep the v1 value until v2 has been written
  successfully; a retry must not duplicate projects, tasks, activity, or runs.
- Define the release gate for moving routes behind the authenticated layout,
  including the compatibility period for old Pi URLs and the rollback behavior
  if the live adapter or migration fails.
- Add live authorization and concurrency tests before calling a phase complete:
  cross-Workspace denial, role changes, duplicate commands, stale asset heads,
  lease takeover, Pi cancellation, retry, and client reconnect. Preview tests
  cover interaction shape only.

## Canonical model and API

The first live model keeps the existing storage tenancy while presenting an
account-level projection:

```text
User/Account 1--* WorkspaceMembership *--1 Workspace
Workspace 1--* Project 1--* Task
Project 1--* Brief
Project 1--* AssetReference *--1 Asset 1--* AssetVersion
Project 1--* Review 1--* Feedback
Project 1--* PiSession 1--1 AgentRun 1--* AgentStep
Project 1--* Activity; Account 1--* Activity
```

Target Project storage is Workspace-owned. `ProjectMember` is
optional and project-scoped; it does not replace Workspace membership. Assets
remain Workspace-owned and may be referenced by multiple Projects through an
explicit association. Asset versions are immutable, and a head change is an
atomic compare-and-set. A Blob is content storage behind a port, not a domain
entity that carries project workflow state.

The proposed capability inventory below is not a list of implemented RPCs.
Extend existing `workspace.assets.*` and Agent procedures where they already
serve the capability; new names must not silently replace working contracts.
The live adapter exposes asynchronous operations and uses bounded queries:

```text
account.profile.get
studio.snapshot.get
projects.list / get / create / update / archive / restore
projects.tasks.list / create / update
library.search
assets.list / get / versions.list / commitVersion / download.get
assets.upload.create / upload.complete
projects.assets.create
reviews.list / create / update / resolve
activity.list
pi.sessions.create / get / cancel / retry
devices.list / revoke / syncStatus.get
```

The current contract tree contains the Project Studio procedure names and the
API router contains their authentication and Workspace checks. Project and
task reads/writes are backed by the first live repository slice. Review,
Feedback, Activity, and Pi-session service methods are implemented and covered
by API tests; their PostgreSQL repositories are wired where available.
AssetReference has in-memory and PostgreSQL repositories, and Library search
and project asset listing resolve authorized assets and immutable versions.
Blob upload/download now has checksum-verified in-memory and filesystem
providers selected by `BLOB_STORAGE_DIR`. Asset-reference creation validates
project/asset/version Workspace consistency and records an activity event. The
RPC body is still base64 encoded and bounded by the API request limit, so a
direct object-storage HTTP boundary remains before large production uploads;
full Pi execution capabilities remain incomplete. The contract's presence must not be
used as evidence that every capability is durable or user-ready.

`studio.snapshot.get` contains account data, project summaries, the first page
of review attention, recent activity, and active session summaries. It never
contains Blob bytes or unbounded versions. The serialized snapshot has a
256 KiB target budget, which must be measured and rejected or reduced before a
live release; the current service does not enforce that byte budget. Full
collections use cursor pagination with a maximum page size of 100. Project
lists sort by `updatedAt DESC, id DESC`, Activity by `occurredAt DESC, id DESC`,
and immutable versions by `createdAt DESC, id DESC`. Lists return `items` plus
an opaque `nextCursor`; the current repository adapters use numeric offsets as
temporary cursors and need an opaque, stable cursor before high-volume release.

The existing RPC transport limits request bodies to 1 MiB and requests to
15 seconds. Blob bytes use the storage upload/download port. Pi start returns
a durable run identifier within the request deadline; progress observation and
reconnection are separate from starting the run. The stream/polling mechanism
and execution host must be settled before live Pi is enabled.

The oRPC/API service methods are asynchronous and must expose stable errors.
The current Web `ProjectStudioDataSource` deliberately keeps synchronous view
methods: the remote adapter applies an optimistic update, performs the request
in the background, and rolls back with a persistence warning on failure. This
is a preview-compatible façade, not the final mutation contract. Before live
routes are enabled, pending state, query invalidation, retry behavior, and
editable input retention must be explicit. Keep `getSnapshot` synchronous for
subscriptions, separate pending/error state from data, and scope caches to the
account and authorized Workspace set. Signing out clears account caches, and
late responses from a previous account are discarded.

Preserve existing `UNAUTHORIZED` and `FORBIDDEN` errors and the existing asset
and Agent domain codes. Phase 1 adds typed codes for validation, missing Blob,
upload limits, media types, timeout, and temporary unavailability, with retry
guidance and localized presentation. Asset commits and Pi start commands use
idempotency keys. Replaying a successful command returns its original result;
reusing its key with different input fails. Permission loss and stale version
conflicts must not trigger an automatic write retry.

The Blob port must provide upload creation, upload completion with checksum and
size validation, download access, and orphan cleanup. File-size limits, supported
types, thumbnail generation, and orphan/version retention must be specified
with the selected provider before upload is enabled. The Review model must
define at least `draft`, `open`, `changes_requested`, `approved`, and `closed`
states, with actor, project, target version, feedback, and transition time.
Feedback references a review and immutable target version, and records author,
body, timestamps, and open/resolved state. New versions do not silently move
existing feedback. Proposed review transitions are draft to open, open to
changes_requested or approved, changes_requested back to open, and an explicit
close action. The permission matrix must distinguish commenting from approving;
effective Project access includes Workspace membership and any project grants.
The API remains the final permission boundary.

### Release constraints for the remaining capabilities

The following constraints turn the open implementation items into release
requirements. A procedure or provider can exist in the contract tree before it
has satisfied these requirements; that is an implementation seam, not evidence
that the capability is ready for production.

#### Blob transport boundary

The current `workspace.assets.upload.complete` procedure accepts a base64
`body`. This is suitable for bounded provider tests and small preview fixtures
only. The API request body is limited to 1 MiB, so base64 expansion leaves less
than 1 MiB for the original bytes and metadata; it must not be the production
transport for the 10 MiB domain limit.

Before user-facing asset upload is enabled, use this two-step production flow:

1. `upload.create` authenticates the actor, checks the resolved Workspace and
   content policy, and returns an opaque upload id, provider upload target,
   expiry, and required headers. The client uploads bytes directly to the
   object-storage boundary over HTTPS; it never sends them through oRPC.
2. `upload.complete` receives only the upload id, byte size, content type, and
   SHA-256 hash. The server verifies the provider object belongs to that upload,
   checks size, media type, and checksum, then atomically marks it complete and
   makes the AssetVersion visible. It must not accept arbitrary object keys or a
   client supplied Workspace as authority. Creating the AssetVersion and
   advancing the asset head is one compare-and-set transaction.

Downloads use an authenticated short-lived provider URL or a streaming HTTP
endpoint. They do not return Blob bytes through an oRPC/base64 response. The
existing port remains the domain seam, and the 10 MiB limit remains the default
per-Blob limit until a provider decision changes it. Provider configuration must
also specify allowed media types, thumbnail behavior, upload expiry (currently
15 minutes), orphan cleanup, and retention of unreferenced versions. Cleanup is
retryable and must never delete a Blob still referenced by an AssetVersion.

The base64 procedure may remain behind an explicitly named test/preview mode,
but the live route must reject it or route to the direct transport. A successful
upload must be safe to retry with the same upload id and checksum; completing an
already completed upload returns the original result, while different metadata
returns a stable conflict. Blob access is always checked against the stored
Workspace and the actor's effective Project/Workspace permission.

The Blob gate is closed only when a provider contract test proves direct upload,
completion, download, expiry, checksum mismatch, size/media rejection, orphan
cleanup, retry idempotency, and cross-Workspace denial. It must also prove that
the upload URL cannot be reused after expiry, completion is a no-op for the same
metadata, and a mismatch cannot complete the upload. The test must assert that
Blob bytes are absent from `studio.snapshot.get` and from operational logs.

#### Pi execution and recovery

The current Pi procedures create and read a `PiSession`, and the Agent seams
persist runs, steps, leases, and the state machine. They do not execute a goal,
deliver progress, or attach artifacts. Live Pi therefore stays disabled until
an execution host and its ownership boundary are recorded. Adding a background
worker or daemon requires a concrete deployment seam; the procedure itself must
not imply that the API process is an execution worker.

For the first live release, use durable polling as the minimum progress
transport. `pi.sessions.create` returns the session and AgentRun identifiers
within the 15 second request deadline; `pi.sessions.get` returns the current
status, current step, step summary, artifact references, and `updatedAt`.
Web/Desktop may poll with backoff while a run is non-terminal and must hydrate
the current state after reconnect. Streaming events are an optional later
optimization and cannot be a prerequisite for correctness.

The execution contract is:

- Create the Pi session, AgentRun, and first queued AgentStep as one durable
  operation. The idempotency record and this graph commit together, so a
  timeout can be recovered by key without creating a second run.
- A worker acquires the existing lease before changing a run or step, heartbeats
  before half of the configured 30 second lease window, and can be replaced
  after lease expiry. Status transitions use the existing state machine and
  conditional writes; terminal runs cannot be leased or changed. A lost lease
  prevents further side effects until a new owner has acquired the run.
- Cancellation is an idempotent server command. A queued, running, or approval
  waiting run reaches a durable `cancelled` outcome, the worker observes the
  request and stops creating new effects, and a race with completion has one
  persisted winner. Effects committed before cancellation remain visible.
- Retry creates a new attempt linked to the predecessor, carries only the
  explicitly retained context, and never replays a successful command under a
  new idempotency key. Replaying the original create/cancel/retry key returns
  the original result; reusing a key with different input is rejected.
- Artifact attachment is scoped to the run's Workspace and target Project or
  AssetVersion. It is idempotent and only exposes a committed artifact after
  the referenced Blob and metadata are durable. Client disconnects do not stop
  a run or hide its eventual terminal state.

The Pi gate is closed only with a fake execution-host integration test and a
PostgreSQL-backed test covering create, polling, reconnect, lease takeover,
cancel/complete races, retry, duplicate commands, artifact linkage, tool scope,
and cross-Workspace denial. The test must observe the terminal state after the
client has disconnected, prove that a lost lease cannot create duplicate
artifacts, and verify the complete status/step history. It must also prove that
cancel and completion races have one durable winner and that a retry cannot
reuse artifacts from the predecessor. A local preview runner does not count as
evidence.

#### Sync and device controls

The first Project Studio release is online-only. `syncStatus.get`, when added,
reports connection state, last successful account snapshot time, and pending
server writes. It does not create an offline queue, local account database,
manifest, tombstone, or conflict replay mechanism. A connection failure keeps
the last known view labelled as stale and exposes retry; it never turns that view
into sample data. Desktop has no sync daemon and stops polling when its process
exits.

Device controls remain read/revoke operations until they have durable backing.
`devices.list` returns an opaque device/session id, platform/label,
current-device marker, last-seen time, creation time, and revoked state.
`devices.revoke` is authenticated, scoped to the account, idempotent, and
invalidates all sessions for the target device before the next protected
request. A device owned by another account is indistinguishable from not found.
Revoking a device does not delete Project, Asset, or Blob data and cannot revoke
the last usable session without an explicit recovery path. Notification delivery
is a separate capability and is not implied by sync status.

The sync/device gate is closed only with two authenticated sessions: disconnect
must show stale online state without offline writes, and revoking one device
must make its next protected API request fail while the other session continues
to work. Tests must also cover repeated revoke, current-device behavior,
membership removal, and account cache clearing on sign-out. No Settings control
becomes interactive before these contracts and tests exist.

#### PostgreSQL migration gate

Generated SQL is not migration evidence. The Project Studio migration set must
be applied to a real PostgreSQL instance using the repository command before
Phase 1 or Phase 4 can be released. The repeatable development runbook is:

```bash
docker compose up -d postgres
bun run generate
bun run db:migrate
bun run db:seed
bun run --cwd packages/db check
bun run --cwd packages/db test
bun run --cwd apps/api test
```

The run must use an explicit `DATABASE_URL` and record the PostgreSQL version,
migration output, and the applied migration rows. On an empty database, every
committed migration must apply once and a second `bun run db:migrate` must be a
no-op. On a copy of the last released schema containing representative users,
Workspace memberships, Projects, AssetVersions, Reviews, Feedback, Activity,
Agent runs, and Pi sessions, the same migration must preserve row counts,
foreign-key relationships, enum values, timestamps, and asset heads. The run
must exercise the new repositories through the API with real authorization. It
must also rerun after an interrupted apply and prove that completed rows are not
duplicated. Record the PostgreSQL major version, migration names, elapsed time,
affected row counts, and checksums as release evidence.

Migrations are forward-only in the application. Before a shared or production
run, take a database backup and verify restore; rollback means restoring the
backup or deploying a compatible previous application, never deleting migration
history or using `db:clean`. `db:clean` is limited to disposable development or
test databases. A migration failure blocks the release switch and leaves the
previous application/data path available according to the deployment rollback
procedure.

The database gate requires attached evidence for both an empty install and a
non-empty upgrade, a successful second run, repository/API integration results,
and backup restore. `bun run verify` remains necessary but cannot substitute for
the real PostgreSQL run when `DATABASE_URL` is absent.

#### Cursor and snapshot limits

Numeric offsets are temporary compatibility behavior in the current memory and
PostgreSQL adapters. Before high-volume or live release, every Project Studio
list must use an opaque, scope-bound keyset cursor. The default page size is 25
and the hard maximum is 100. The cursor carries a version, resource/filter
identity, authorization scope, and complete ordering key, protected by the
server cursor key; the client treats it as an uninterpreted string. Projects use
`updatedAt DESC, id DESC`, Activity uses `occurredAt DESC, id DESC`, Versions
use `createdAt DESC, id DESC`, and each other list defines the same unique
tie-breaker before it is exposed. The query must fetch `limit + 1`, return at
most 100 items, and generate `nextCursor` from the last returned row. A cursor
for another account, Workspace, Project, filter, or sort order returns
`INVALID_CURSOR`; it must not silently restart at offset 0.

The preview adapter may keep numeric cursors for fixture simplicity, but the
remote/live adapter and PostgreSQL repositories must not. Keyset pagination must
be tested across inserts, deletes, equal timestamps, repeated requests, and
authorization changes. A page is ordered and repeatable for its request scope;
new writes before the cursor may appear on a later fresh query, but a page walk
must not duplicate or skip rows because of offset drift.

`studio.snapshot.get` is an aggregate summary, not a collection endpoint. The
server measures the UTF-8 serialized response payload at the response boundary
and enforces a hard 256 KiB maximum, including its envelope. It contains no Blob
bytes and no unbounded versions or activity. The first release caps the summary
at 50 projects, 20 review-attention items, 50 recent-activity items, and 20
active-session items; full collections are fetched through their paginated
procedures. If optional summary lists would exceed the budget, the server
applies a documented deterministic truncation order and returns truncation
metadata/cursors. If the minimal account and project summary still exceeds the
budget, it returns `SNAPSHOT_TOO_LARGE` with retry guidance rather than sending
an oversized response.

Snapshot tests must generate oversized names, activity, sessions, and project
counts; assert the measured payload never exceeds 256 KiB; verify no Blob body is
included; and verify deterministic results and continuation through full list
procedures. The gate also requires the 1 MiB request-body and 15 second request
limits to remain enforced, account/Workspace cache scoping, invalidation after a
write or membership change, and rejection of late responses after sign-out.

The target Project Studio UI uses no `pi` item in primary Project navigation.
The current public preview still validates and renders `?tab=pi`, and its
standalone `/projects/$projectId/pi/$sessionId` route is the existing deep-link
and recovery surface. Keep that URL stable for the first live release. Move
`/`, `/projects`, `/projects/$projectId`, `/library`, and the Pi detail route
under the existing `(app)` authenticated layout without changing their public
paths; the current files are still top-level and therefore remain preview
routes.

Phase 3 removes the preview `pi` tab from the primary navigation. During the
compatibility period, `?tab=pi` redirects to the project's session history or
the standalone session URL after resolving a valid session. Unknown or
unauthorized project/session IDs must return the existing recovery/not-found
state without leaking whether another Workspace owns the ID. Remove the
redirect only after one compatibility release plus telemetry or an equivalent
explicit migration test; an unverified absence of use is not a removal gate.

## Preview migration runbook

The implemented preview v2 envelope is `{ version: 2, migratedFrom: 1, data }`
at `voidmix.project-studio.preview.v2`. The `data` payload is the validated
Project Studio shape and still contains the view snapshot's `version: 1`; the
two version numbers must not be conflated. The v1 value remains untouched until
v2 validates and writes successfully. A successful write is the migration
marker; reloading v1 after that point is ignored. Repeating migration is
therefore a no-op.

Fresh previews use `migratedFrom: null`. A valid existing v2 takes precedence.
Invalid or future-version v2 values are preserved without being overwritten;
recovery uses in-memory preview until an explicit reset. All migration runs in
tab-local `sessionStorage`, and none of this preview data becomes account data
as a side effect of signing in.

The proposed preview field map retains `legacyStatus` for provenance. It is not
a production database backfill policy:

| v1 value                                   | v2 value                                                           |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `project.name`                             | `project.title`                                                    |
| `active`                                   | `stage: in_progress`, `archived: false`                            |
| `paused`                                   | `stage: in_progress`, `archived: false`, preserve pause provenance |
| `completed`                                | `stage: delivered`, `archived: false`                              |
| `archived`                                 | `stage: draft`, `archived: true`, `stageWasDefaulted: true`        |
| missing cover/thumbnail/deadline           | `null`                                                             |
| missing assets/reviews/project members     | empty collections                                                  |
| existing project/task/activity/session IDs | unchanged, preserving references                                   |

Dates are serialized as ISO strings at the browser-storage boundary and revived
to native `Date` values after schema validation. The current adapter preserves
malformed or future-version v2 values without overwriting them, uses the seed
in memory, and blocks further writes to that key; malformed v1 remains intact
and also uses the seed. The explicit localized "saved preview could not be
restored" label is still a product requirement for the recovery UI. Fixtures
must cover a valid v1 payload, each status mapping, missing optional fields,
malformed JSON, invalid dates, unknown versions, repeated migration, and a
running session that becomes cancelled after reload. Interrupted sessions are
never resumed automatically. Storage quota/write failures leave v1 intact and
expose a persistence warning. Archive timestamps missing in v1 remain unknown;
the migration must not invent a historical archive time. Keep the old key for at
least the compatibility release and remove it only through an explicit cleanup
step after successful migration.

## Phase exit gates

| Phase | Required result                                                                           | Owning workspaces                | Status at this audit                                                                                                                                       | Exit checks                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Functional Library, localized shell, account control, and Studio preview naming           | Web, Desktop                     | Committed in `fff21412`; retain preview labels and compatibility behavior                                                                                  | focused Web tests, Desktop check, `bun run policy`, `bun run format`                                                                                                              |
| 1     | Canonical model, contracts, repositories, v2 migration, and remote adapter skeleton       | Core, Contracts, DB, Client, Web | In progress in the working tree; Project/Task/Review/Feedback/Activity/Pi repository and API slices are present, remaining storage and access work is open | owning `check`/`test` commands, `bun run generate`, real PostgreSQL empty/upgrade run, migration fixtures, auth isolation tests                                                   |
| 2     | Shared shell, navigation, command menu, and reusable primitives                           | Web, Desktop, UI                 | In progress; Desktop navigation and preview views exist, live data and full shared shell open                                                              | UI component tests, Web/Desktop builds, keyboard and responsive checks                                                                                                            |
| 3     | Home, Projects, all Project sections, Library, Activity, Settings, and online sync status | Web, Desktop                     | Not started as a complete phase; current pages still contain preview or placeholder behavior                                                               | feature tests, live API integration tests, sync/device two-session test, 390/768/1280 layout checks                                                                               |
| 4     | Authenticated live routes, Pi/asset/review behavior, compatibility retirement             | API Runtime, Web, Desktop, E2E   | Not started; route switch and durable backend capabilities remain open                                                                                     | direct Blob transport test, Pi execution/reconnect/cancel/retry test, keyset cursor and 256 KiB snapshot tests, PostgreSQL upgrade evidence, `bun run verify`, `bun run test:e2e` |

Each phase is releasable only when its migration, documentation, and rollback
condition are recorded. Live routes remain behind a release switch until the
remote adapter passes its authorization and failure tests. Rollback restores
the previous route switch and preserves preview v1 and legacy Pi URLs for the
compatibility period; it does not delete user data.
The switch controls capability exposure, never API authorization. Rolling back
live routes must keep authentication and show an unavailable state if needed;
it must not fall back to a public preview using cached account data. Schema
changes remain additive through the compatibility period, and old-client/new-API
compatibility must pass before a rollback is considered available.

The table is a release order, not a parallel work list. The following criteria
are the minimum evidence for each exit:

- **Phase 0 exits** when preview v2 migration fixtures pass, preview data is
  visibly labelled, the public route has loading/error/retry states, and Web and
  Desktop pass their focused UI checks at 390px, 768px, and 1280px. It may not
  claim account persistence or live Library behavior.
- **Phase 1 exits** when the canonical Workspace ownership and permission
  matrix is implemented in Core, contracts, API, memory, and PostgreSQL; all
  Project Studio migrations apply to empty and representative existing
  databases; and cross-Workspace, idempotency, stale-head, and membership
  removal tests pass. It also requires the signed cursor format and snapshot
  byte-budget test, even if the UI still uses preview data. Phase 1 depends on
  the existing auth/membership and asset-version transaction seams.
- **Phase 2 exits** when the shared shell and command entry points render in both
  applications, keyboard focus/Escape behavior and reduced-motion behavior are
  tested, and Web/Desktop builds produce their intended route artifacts. No
  live capability may be represented by a preview control without an explicit
  unavailable state. Phase 2 depends on the Phase 1 contract names and view
  models.
- **Phase 3 exits** when every Project section has a real empty/loading/error
  state and the live API path supports project creation, brief start, asset
  reference/version display, review/feedback projection, activity, and online
  sync status. The two-session device revoke test, responsive checks, and
  authenticated browser journey must pass. Canvas upload remains disabled until
  the direct Blob gate passes. Phase 3 depends on Phase 1 persistence and Phase
  2 navigation.
- **Phase 4 exits** when the release switch serves authenticated live routes,
  direct Blob upload/download, durable Pi execution with reconnect/cancel/retry,
  review actions, keyset pagination, and the 256 KiB snapshot ceiling all pass
  their contract and PostgreSQL integration tests. It also requires the real
  migration evidence, `bun run verify`, and the complete E2E journey. Legacy Pi
  URLs and the v1 preview key remain for one compatibility release; retirement
  needs telemetry or an explicit migration test plus a documented rollback.
  Phase 4 depends on every earlier phase and cannot be released by enabling a
  feature flag around incomplete endpoints.

## Implementation sequence

### 0. Repair the baseline slice

The original `7109fed3` navigation slice was completed and committed as part of
`fff21412`. Its delivered work includes the Library feature extraction, Studio
preview naming, account control, localized shell copy, and the v2 preview
storage boundary. Keep the route module thin, keep preview state visibly
labelled, and do not treat the committed preview screens as live Library data.

### 1. Establish the product model

- The working tree has added the Project/Task model, contracts, API procedure
  tree, repositories, lifecycle projection, preview migration, and a remote
  adapter skeleton. Keep these additive until the phase gates below pass.
- Finish account aggregation and the server creation-context rule. Add
  `ProjectMember` only with a permission matrix that remains subordinate to
  Workspace membership.
- Add durable repositories and state machines for asset references, Blob
  operations, and the remaining Pi/Agent execution projections. Review,
  Feedback, Activity, and the Pi-session repository/service slice is already
  present; keep it behind the phase gates until PostgreSQL and runtime tests
  cover the complete release behavior.
- Update `CONTEXT.md` and owning workspace documentation only when these model
  changes become running truth; this document records the plan and audit.

### 2. Build the shared shell and components

- Desktop now has the five destination labels and Devices under Settings in the
  working tree. Complete the equivalent authenticated Web shell and account,
  Activity, and Settings surfaces before calling this phase complete.
- Introduce Project Studio tokens and the shared components needed by both apps.
- Keep route modules thin, application composition local, and existing Base UI
  accessibility behavior intact.
- Add Command Menu navigation and global `CommandComposer`; keep initial-route
  menu code lazy where current bundle rules require it.

### 3. Rebuild the product surfaces

- Home: presentation-led hero composer, three metrics, Continue creating,
  review queue, recent assets, and activity.
- Projects: stage filters, creation, archive view, covers, deadlines, and useful
  empty states.
- Project: implement all seven sections and contextual Pi actions.
- Library: assets, references, briefs, versions, search, preview, and project
  association.
- Activity and Settings: account-wide history plus account, AI, notification,
  sync, and device controls.
- Desktop: use the same semantics with denser panels and native sync/runtime
  status. Do not copy Web page composition wholesale.

### 4. Connect live behavior and retire compatibility

- Put live Project Studio routes behind the authenticated application layout and
  send successful login directly to Home.
- Connect Pi commands, asset/version operations, feedback, reviews, and activity
  to authorized API procedures.
- Keep legacy Pi URLs and preview storage migration for one release cycle, then
  remove them only after telemetry or explicit migration tests show no remaining
  use.
- Replace all user-visible Workspace copy in Web/Desktop, manifests, metadata,
  recovery text, tests, and documentation. Retain the internal tenancy term only
  where it remains architecturally accurate.

## Current implementation audit

### Committed baseline

The review baseline is `fff2141218a5570cd83a69792ea3d4956ee1ced6`, not the
earlier `7109fed3` navigation commit. It contains the committed preview slice:
Web Library extraction and Studio naming, account control and localized shell
copy, preview v2 storage/migration, and the existing Project/Pi preview routes.
The committed baseline does not contain the uncommitted Project Studio model,
repository, API, Desktop navigation, or remote-adapter work listed below.

Existing foundations include Workspace membership authorization, asset
version/conflict services and persistence, and durable Agent run/step/lease
services. Extend these seams rather than recreating them. A passing
`bun run verify` proves repository consistency, not completion of this plan.

### Current working tree observed September 9, 2026

The working tree contains uncommitted Phase 1 and Phase 2 work. The following
is implemented and covered by the reported narrow checks:

- Core lifecycle types and progress calculation, including stage transitions,
  independent archive state, restore-to-previous-stage, and legacy mappings;
- Project Studio contract schemas and API procedure names for projects, tasks,
  assets/references, Reviews/Feedback, Activity, Pi projections, pagination,
  and idempotency inputs;
- `projects` and `project_tasks` schema, relations, generated migration, and
  in-memory/PostgreSQL Project repositories;
- API handlers with authentication, global permission, and Workspace access
  checks, plus the live Project/Task service wiring;
- Review, Feedback, and Activity service/repository wiring, Pi-session
  repository wiring, and API integration coverage for these service paths;
- Preview v2 migration tests and an explicit Web remote adapter that propagates
  hydrate/request failures instead of falling back to preview data;
- client POST classification for Project Studio mutations;
- Desktop navigation for Home, Projects, Library, Activity, and Settings, with
  Devices under Settings and preview project/detail views.

The following are still open and prevent the related phase from being complete:

- Public Web routes continue to use the Preview adapter, while the authenticated
  route group now injects the remote adapter. The adapter chooses the first
  Workspace returned by the account snapshot for creation; writable memberships
  are ordered first, and a clear error is shown when no writable context exists.
- Project and task service methods are the configured durable slice. Review,
  Feedback, and Activity ports now have in-memory and PostgreSQL repositories,
  and their service methods are covered by API integration tests. AssetReference
  has in-memory and PostgreSQL repositories, and Library/project asset queries
  are wired to the existing Asset and AssetVersion repositories. Pi-session
  has the Core port, Memory/PostgreSQL repositories, schema/migration, runtime
  wiring, and API service paths; durable Agent execution, progress,
  cancellation/retry completion semantics, and artifact linkage remain open.
  AssetReference creation and Blob upload/download are now exposed through
  authorized service/API paths; asset version mutation still needs a
  user-facing upload flow and direct object-storage boundary.
- The service aggregates active Workspace memberships when the membership and
  `listByWorkspace` ports are present; the compatibility owner filter remains
  in the repository/application interface. ProjectMember persistence, detail
  projection, mutations, and grant-aware authorization now exist. Project
  creation resolves an omitted Workspace through the deterministic writable
  membership rule.
- Web Brief/Canvas/Feedback still have placeholder sections;
  authenticated Project Studio routing and the `?tab=pi` compatibility redirect
  have landed. Desktop Projects and Library now use the shared API adapter with
  explicit preview, cloud, loading, and unavailable states; project detail and
  upload mutations remain follow-up work. The standalone Pi deep-link remains
  available for sessions with an id.
- Generated migrations now include the Project Studio Review/Feedback/Activity
  and Pi-session tables, including
  `packages/db/drizzle/20260908195640_cynical_jack_murdock/migration.sql` for
  `pi_sessions`. They have not been applied against a real PostgreSQL instance
  in this environment. `bun run verify` passed without a configured
  `DATABASE_URL`; database migration and live integration evidence remain
  environment-dependent.
- Blob providers enforce a 10 MiB limit and SHA-256 checks, but the current RPC
  completion path still receives base64 bytes and the filesystem provider is a
  local storage implementation. Direct object-storage upload/download,
  provider cleanup, and the production media policy remain release gates.
- No `devices.*` or `syncStatus.*` capability is currently wired. The first
  release remains online-only; Settings status and device revocation require
  authenticated contracts, durable session backing, and the two-session test
  described above.
- Snapshot responses are not yet measured against the 256 KiB budget, and the
  live list adapters still parse numeric offsets. The remote/live path must
  reject invalid scope cursors and use keyset pagination before high-volume
  release.

## Acceptance and verification

A phase is complete only when its behavior, tests, documentation, and migrations
land together. The overall migration is complete when:

- sign-in reaches Home without a Workspace decision;
- a new user can create a project and begin a brief within 30 seconds;
- Home resumes recent work and launches Pi;
- Project exposes all seven target sections and consistent stage semantics;
- Library search returns real briefs/assets/versions and preserves migrated
  preview data;
- Web and Desktop share navigation terms, project stages, and interaction
  semantics;
- no user-facing Workspace selection or copy remains;
- keyboard-only use, visible focus, reduced motion, both themes, and 390px,
  768px, and 1280px layouts are verified;
- narrow workspace tests pass, then `bun run verify` passes;
- `bun run test:e2e` covers sign-in redirect, project creation, brief start,
  Library search, Pi cancellation, and old-preview migration.

Use the verification commands in each owning `AGENTS.md`. Build Web or Desktop
after route changes so the TanStack Start plugin regenerates route trees. Do not
hand-edit generated route trees.
