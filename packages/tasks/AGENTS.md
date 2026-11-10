# @raypx/tasks

`/server` owns the remote task read projection and stored task/event/request
schemas. Its injected ports provide account reads and device-authorized transactions;
it never imports Control, a database adapter or an application. Keep connection
fencing, snapshot/event commits and frozen-context receipt release atomic. Core
owns domain rules and CLI owns execution and the durable device journal.

Shared Agent task and approval views for Web and Desktop.
Workspace composition, task details, approvals and device management live in separate
client modules. Approval reads do not depend on task-list availability. Test fixtures
implement the independent ports and fail unexpected calls; never cast partial clients.
There is no root entry. /model owns the pure task helpers (isTaskActive, taskCursor) alongside the independent TaskWorkspacePort,
WorkspaceScope, deterministic ConversationState, bounded draft parsing and pure diff
previews. /client exports DOM components and visibility-aware subscriptions;
TaskWorkspacePort is the canonical model interface. /client/pending-count
exports only the approval badge for always-mounted shells, without the workspace or virtualizer.
`/client/task-composer` exposes the standalone composer and its plain draft type.
`/client` exposes `ProjectSessionGroup` for expandable sidebar history with
application-owned links. `/model` exposes `sessionThreads`, which groups follow-ups
within a loaded task page and orders conversations by their latest activity.
Applications can inject a restored draft and a guest sign-in/persistence adapter;
guest submissions call that adapter without invoking task creation. The application
owns authentication and handoff storage. Restored text always waits for an explicit Send.
Remote reads use TanStack Query (a peer) and require a QueryClientProvider; keys are scoped by
client instance and account, and relay notifications invalidate them while the page is visible. Web injects its
relay client; Desktop can inject an IPC adapter and local copy. DeviceSettings
continues to require the remote device management client. No native, database,
authentication or CLI implementation imports. Never display raw exception messages or render
agent content as HTML. User mutation retries retain their idempotency ID.
Domain schemas and revisions come from Core; contracts owns transport envelopes.
Optional React `contextLibrary` props inject `@raypx/memory/client` references into
the composer, without a browser dependency in TaskWorkspacePort. Drafts persist
only validated source IDs/revisions, never raw context snapshots. Target changes
clear the selection; guest handoff and account/scope changes never migrate it.
Creation sends `contextSelection`; only the runtime supplies the immutable
`task.context` snapshot rendered in task details. Templates remain reference text
and do not grant tools or execute on selection.
WorkspaceScope distinguishes device and remote ownership, derives
cache identities and preserves the existing draft storage keys. Applications provide
the confirmed scope; a guest editor never creates a private workspace or executes
a restored draft. ConversationState owns cursors, revision merges and history gaps;
React hooks supply reads and subscriptions. A rejected delta batch leaves its prior
projection intact until a checkpoint arrives. Diff uses jsdiff's strict parsing;
provider adapters retain the complete original approval when parsing is uncertain.
Checkpoint coverage is separate from live-entry order: global SQLite row IDs are
sparse within a task. A newer live entry cannot hide an unfilled checkpoint gap.
Call beginRecovery before visibility/source resets or missing-baseline recovery
to freeze proven live coverage. Continuous live coverage resumes only once an
authoritative page catches the observed live watermark; pure models without
these lifecycle signals retain conservative checkpoint-only coverage.
History pagination aborts on unmount or scope/task changes; late adapter results
cannot merge history, report failures or refresh the old owner. Timeouts release
both query loading and the paging control even when a transport ignores its signal.
Draft enums require literal values; coerced arrays/objects are invalid stored inputs.
Task lists navigate by creation-time/ID cursors. Probe the next cursor even after
a short page: a local response may reach its byte limit before its record limit.
TanStack Virtual renders the visible task rows with measured heights and stable
task IDs. Keep the keyboard tab stop mounted; arrows and Home/End reach every row.
Changing pages resets the list viewport without changing task execution or storage.
Search and status/agent/computer filters apply only to the loaded page; show the
matching/loaded count and retain cursor navigation even when no rows match.
Lists, details and approvals render session states through `TaskStatusBadge`
(`client/task-status.tsx`), so every state keeps the same label, variant and shape.
Conversation tool calls render through `ToolActivityRow` (`client/tool-activity.tsx`):
an intent icon from the tool name, a live or final duration, the status label and
the update time. `ShimmerText` animates running names with the Web Animations API
and stays static under reduced motion. A running session with no streaming text or
running tool shows a working line outside the virtual list, so row counts and
scroll anchoring are unchanged.
The Activity disclosure renders `RunTimeline` from `runSteps` (`model/run-steps.ts`):
one row per status change, one per human request at its current status and one
summary per run of tool calls, with the step in flight marked `aria-current`.
Messages and streaming deltas stay in the conversation.
Use shadcn controls and confirmation dialogs for disconnecting a computer. Keep
failed mutations open for a deliberate retry and block duplicate submissions.
Style components with Tailwind utilities. The client CSS entry only registers
the shared source directory for both application builds.
If a create receipt is lost, recover the same submitted task from its authoritative
read projection instead of blocking its approval behind the creation form.
Pure tests live beside `src/model/` source; shared-view suites use
`*.component.test.tsx` beside `src/client/` modules, grouped by responsibility.
Run this workspace's check/test, focused `test:unit`/`test:component`, then repository verify.
Application auth, routing and IPC adapter tests remain with Web/Desktop.

Task details merge normalized conversation entries by ID/revision, load older
pages on demand and follow streaming output only when the reader is near the end.
ConversationState keeps ordered IDs and cached snapshots: only insert new IDs into
order, preserve unchanged entry objects and stage delta batches before committing.
Conversation rows use measured TanStack Virtual heights, stable IDs and overscan 6;
retain the row containing keyboard focus and anchor reading by visible ID/offset
when history or Markdown heights change. Loaded history is never evicted. The
explicit full-text mode mounts all loaded rows for selection/browser search, keeps
manual older/gap paging and the reading position, and resets on task change.
`perf:tasks` exercises a deterministic 10,000-entry tail-update workload; the
Chromium conversation fixtures load at most 200 messages in total and check the
720px viewport/80-row DOM bound, focus, loaded full text, message revisions and
history loading under fourfold CPU throttling. Virtual reading restoration uses
an index target with the saved row offset so pending measurements retarget it.
Markdown must skip raw HTML and remote images. Recognized edit approvals have a
bounded Diff plus the complete original request. In-flight controls depend on the
host's advertised inputModes; explain Claude interrupt versus Codex current-turn
steer. Recover lost input receipts by authoritative entry ID without resending.

Task workspace uses one reading column for either the composer, drafts and paged
virtual history or the selected session. Returning to history preserves the selected
row and filters. The host can request editor focus through `newSession` and clear
the request through `onNewSessionShown` once the editor is ready. Opening and
closing the editor preserves unsent text. Saved drafts expand on demand. Finished
tasks show their outcome before the expandable full conversation.
Applications own project/computer selection in their URL and pass `projectId` and
`deviceId` as a controlled execution target. List reads and next-page probes send
the same target; storage filters it before pagination. Remount the cursor, editor
and detail selection on target changes. Draft/editor identities include that target.
Search/status/agent filters still describe only the loaded page. Project views hide
duplicate computer/project controls and reject a detail from another target.
Overview counts describe the loaded
page; running/queued excludes tasks waiting for an answer. Drafts are explicitly
saved to device storage, scoped by injected server identity, account and local/remote
task location. Validate and bound stored drafts (20 drafts, 32,000 characters each);
preserve editor text on storage/delivery failures. Drafts never execute until Send.
Desktop opts into `persistEditor` for a separately bounded current-editor slot, restored
before the composer mounts. Keep its owner/namespace identical to the named draft list.
The device owner persists across account changes; remote slots remain account-scoped.
Existing-session instruction and follow-up editors use a separate owner-scoped collection
bounded to 20 slots of 32,000 characters, identified by computer/project/task/input type.
Persist validated frozen delivery receipts for deliberate retries; only matching confirmed
receipts clear text, and late success never clears replacement edits or selects another task.
Live conversations remain mounted and open on completion. Reading older output exposes
a return-to-latest action and signals new output without disturbing the reading anchor or full-text mode.

Optional `client.observed` adds a separate terminal-request section. List summaries
omit tool bodies; expansion loads one request. Render capabilities, revision/epoch
and expiry before enabling actions; preserve the exact receipt after uncertain
delivery. Delivered is distinct from applied. Include observed pending counts
without counting a locally mirrored remote request twice.
Pending counts isolate failed sources and label known partial totals; do not hide
healthy approvals or present an unknown total as zero. Device-disconnect confirmation
explains deletion of synced terminal approvals and preservation of managed history.

The injected memory budget view shares Core's exact formatter and gates submission
until selected revisions are measured. Never persist fetched reference bodies in drafts.

Optional models ports enable local Pi selection/defaults. Follow-ups retain model/revision/transfer confirmation in one retry payload; remote clients omit the port. Model references may persist in validated drafts; credentials never do.

Model composition owns capability-based create/continue rules and frozen submission/transfer inputs. Browser draft storage implements TaskDraftStore; views never read localStorage directly. Internal continuation maps from the unchanged piContinuation IPC field.
The model composer reducer owns editor transitions, target/model/budget readiness and draft
save/cleanup rules, tested without DOM. `useTaskComposer` adapts it to React, storage,
confirmation and creation; `src/client/composer/` holds its focused subviews.

ModelPicker composes UI's searchable Base UI Combobox with provider groups and
connection-aware identity. Its compact variant is used by the composer; catalog,
default-model and readiness behavior stay in the picker. Search and popup state
are ephemeral. Computer settings filter the loaded list locally without new reads.
Task views follow the compact list, transcript, result and request patterns using
the same UI primitives; conversation virtualization and domain state stay unchanged.
