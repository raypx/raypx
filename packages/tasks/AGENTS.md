# @raypx/tasks

Shared Agent task and approval views for Web and Desktop.
The root exports pure state helpers; /client exports DOM components, the minimal
TaskWorkspaceClient interface and visibility-aware subscriptions. /client/pending-count
exports only the approval badge for always-mounted shells, without the workspace or virtualizer.
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
Run this workspace check/test and the repository verification gate.
