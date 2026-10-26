# @raypx/tasks

Shared Agent task and approval views for Web and Desktop.
The root exports pure state helpers; /client exports DOM components, the minimal
TaskWorkspaceClient interface and visibility-aware subscriptions. /client/pending-count
exports only the approval badge for always-mounted shells, without the workspace or virtualizer.
`/client/task-composer` exposes the standalone composer and its plain draft type.
Applications can inject a restored draft and a guest sign-in/persistence adapter;
guest submissions call that adapter without invoking task creation. The application
owns authentication and handoff storage. Restored text always waits for an explicit Send.
Remote reads use TanStack Query (a peer) and require a QueryClientProvider; keys are scoped by
client instance and account, and relay notifications invalidate them while the page is visible. Web injects its
relay client; Desktop can inject an IPC adapter and local copy. DeviceSettings
continues to require the remote device management client. No native, database,
authentication or CLI implementation imports. Never display raw exception messages or render
agent content as HTML. User mutation retries retain their idempotency ID.
Task lists navigate by creation-time/ID cursors. Probe the next cursor even after
a short page: a local response may reach its byte limit before its record limit.
TanStack Virtual renders the visible task rows with measured heights and stable
task IDs. Keep the keyboard tab stop mounted; arrows and Home/End reach every row.
Changing pages resets the list viewport without changing task execution or storage.
Search and status/agent/computer filters apply only to the loaded page; show the
matching/loaded count and retain cursor navigation even when no rows match.
Use shadcn controls and confirmation dialogs for disconnecting a computer. Keep
failed mutations open for a deliberate retry and block duplicate submissions.
Style components with Tailwind utilities. The client CSS entry only registers
the shared source directory for both application builds.
If a create receipt is lost, recover the same submitted task from its authoritative
read projection instead of blocking its approval behind the creation form.
Run this workspace check/test and the repository verification gate.

Task details merge normalized conversation entries by ID/revision, load older
pages on demand and follow streaming output only when the reader is near the end.
Markdown must skip raw HTML and remote images. Recognized edit approvals have a
bounded Diff plus the complete original request. In-flight controls depend on the
host's advertised inputModes; explain Claude interrupt versus Codex current-turn
steer. Recover lost input receipts by authoritative entry ID without resending.

Task workspace keeps the composer/drafts and paged virtual task list in the left
column, with the selected task in the right column when space allows. Stacked
layouts switch between list and detail, preserving the selected row and filters.
The wide split can be resized by pointer or keyboard and stores only its width
as a device preference. Existing-task views start with a compact editor; opening
and closing it preserves unsent text. Saved drafts expand on demand. Finished
tasks show their outcome before the expandable full conversation.
Optional project selection filters the loaded page and can be controlled by an
application URL through `projectId`/`onProjectChange`; never imply a global search.
Overview counts describe the loaded
page; running/queued excludes tasks waiting for an answer. Drafts are explicitly
saved to device storage, scoped by injected server identity, account and local/remote
task location. Validate and bound stored drafts (20 drafts, 32,000 characters each);
preserve editor text on storage/delivery failures. Drafts never execute until Send.
Desktop opts into `persistEditor` for a separately bounded current-editor slot, restored
before the composer mounts. Keep its owner/namespace identical to the named draft list.
The device owner persists across account changes; legacy and remote slots remain account-scoped.

Optional `client.observed` adds a separate terminal-request section. List summaries
omit tool bodies; expansion loads one request. Render capabilities, revision/epoch
and expiry before enabling actions; preserve the exact receipt after uncertain
delivery. Delivered is distinct from applied. Include observed pending counts
without counting a locally mirrored remote request twice.
Pending counts isolate failed sources and label known partial totals; do not hide
healthy approvals or present an unknown total as zero. Device-disconnect confirmation
explains deletion of synced terminal approvals and preservation of managed history.
