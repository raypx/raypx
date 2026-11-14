# @raypx/agents

Backend groups use explicit mentions, retained participants and one gapless
conversation counter across concurrent Agents. Native `agent_send_message`,
`agent_delegate` and `agent_wait` tools keep the originating member's authority;
delegation intent/results and instruction revisions are durable. Child Runs
produce parent-tagged activity, without visible child replies. Per-Agent Computer
operations use a fenced gate independently of concurrent model work.

`/model` owns pure Space/Agent page selection, the conversation projection and its
injected RPC, stream and draft ports. ComputerController owns the Space computer
lifecycle projection, guarded commands and refreshes from events/reconnects. Applied state and cursor advance together;
React lives only in `/client`. Web and Desktop consume that shared workspace. The shell owns its single title;
list/detail panes fill the tool layout, with a scrolling transcript and fixed composer.
Space selection and New Agent mount into sidebar slots. The conversation header opens Routines and Space memory sheets through optional
`routines` and `spaceMemory` ports, and the computer panel: a sheet below 1280px, an inline side panel
at wider widths. `CapabilitySheet` owns all three sheets' heading focus and
scoped tooltip Escape propagation; one Escape closes the sheet even with its
close tooltip open. Final focus resolves the currently visible opener. The
compact menu also opens the team computer, whose indicator remains on the bar.
Computer Stop requires confirmation. Pending approvals appear once as
cards; resolved requests fold into tool rows. The composer links to offscreen requests
and shows one primary Stop or Send action. Sending uses the existing message port.
Model conversation rows keep reply identity/order stable from queue through commit.
The client reuses Blocks Markdown, keeps reading anchors, and announces Run lifecycle
and approval changes without announcing streaming text or deadline ticks. Direct replies
omit sender names; optional sender context supports multiple participants. The top bar
owns the selected Agent name and computer indicator in one non-wrapping row.
Only the name shrinks. Below 640px, Routines and Memory share an overflow menu;
at wider widths they appear inline. Toolbar content is portaled outside `main`,
so header responsiveness uses viewport breakpoints, not `@*/main` queries. Enter sends, Shift+Enter inserts a newline, and IME owns composition.
Run metadata adds optional trigger/provenance fields for Mobile compatibility.
Live Run metadata hydrates from snapshots without replacing the event cursor or live text.
`/messages/en` and `/messages/zh` own the `agents` catalog; `/client/styles.css`
registers Tailwind sources only. Component tests use happy-dom and
`*.component.test.tsx`; `test:unit` selects the pure model and server suites.
Drafts and frozen uncertain-send receipts stay on the device, scoped by origin,
account, Space and Conversation. Restoration and failed-Run retry only restore
editing state. Never resend without an explicit action or render provider content as HTML.

`/server` exposes database-free repository ports and Agent/Conversation projections.
`/server/postgres` implements persistence. These are separate from device-owned
tasks and execution. Core owns the
schemas; API resolves a fresh SpaceScope through Spaces on every request.

Every read and mutation requires that scope and filters by `space_id` in SQL.
Lists filter before limiting. Agent creation and its one direct Conversation are
one transaction; updates preserve the Conversation, deletion cascades it. Composite
foreign keys and uniqueness enforce same-Space references and at most one direct
Conversation.

`/server` also owns ConversationsRepository and the ConversationFanout subscriber
port; `/server/postgres` provides both adapters. Member sends lock the conversation
counter, reuse a member/conversation idempotency receipt, then atomically insert a
message and immutable event, advance the counter and publish a content-free hint.
Snapshot and cursor reads hold the conversation counter while persisting departed
actor cancellations and reading state with its cursor. Prefix retention keeps
messages and advances the replay floor atomically. API owns socket lifecycle,
ACKs and fresh membership checks. Sends also record a queued Run and keyed delayed backup job in the message
transaction, then dispatch directly through ConversationRunner. Messages received
while a Run is running or waiting steer that Run at the next model boundary.
`/server` owns the injectable member-aware ModelAccess port and process-local
LiveReplies prefixes. PostgreSQL owns execution leases, monotonically increasing
fences, attempts, canonical checkpoints, steering receipts and backup jobs.
Every attempt mutation holds the conversation counter and verifies the current
unexpired owner/fence under the Run lock. Turn output and checkpoint commit together.
The worker starts scans explicitly; runtime construction performs no database I/O.
Graceful close cancels local requests and computer work, preserves approval cards,
releases leases and publishes a content-free fanout hint. Stop instead commits
cancelled and resolves pending cards. Resume validates the pinned deployment
connection and computer generation. Unknown effects block; young intents wait for
the shared uncertainty deadline without replay. Completed effect outcomes are reused.
The bounded tool loop uses only the Computer port; the Space approval-mode
exception falls back to the Run actor's account default, with that actor's exact
tool/executable rules. Approval answers append Space audit intents and commit
their terminal evidence with the decision; missing audit storage blocks the write.
API owns credentials and configuration.
Deletion cascades durable Run records with their Space. Computer pin identities
remain historical selectors so a missing computer produces an explicit failure.

Use public workspace entries and `.js` relative specifiers. Unit tests live beside
source. Run `bun run --cwd packages/agents check` and `test`. `test:postgres`
selects `tests/postgres/` and requires a newly provisioned disposable `*_test` database.

Tool lifecycle records deduplicate `tool.started`/`tool.finished` by Run/tool-call
ID across resumes and event retention. Effect outcomes and finish events commit
together; reads/refusals finish with their checkpoint. Snapshot activity is capped
at 100 and contains summaries only. Approval cards correlate by toolCallId.
Every effect read/decision lazily expires old intents using the service clock.
Successful built-in Page create/update results add optional nullable `page: { id,
version }` to finished events and activity in snapshots/history. Only operation
results supply it; arguments and display targets never do. Retained same-Space
Page identities preserve the reference after Page deletion and event pruning.
Member reads hold counter/Run locks and use the current stored fence without a
live lease; tracked-tool unknown events commit once with expiry. Executor writes
still require the current unexpired attempt fence.

Phase 4 adds routine/webhook/email trigger projections and private inbound Run
provenance. The shared change policy asks on untrusted writes before Allow;
Never ask and Block retain their existing precedence. Runner recall is an injected
port: selected memory revision/context and first-start late routine annotations
commit to the checkpoint before model access and are reused on recovery.
`dispatch` wakes already committed non-message Runs through the normal runner.
`allowSharedMemory` is an optional Agent configuration (default false).

Historical message/Run actor IDs survive account and membership deletion.
Approval requests remain attached to their Run actor; card events retain their
Space/Conversation/Run/request composite FK after cancellation. Worker scans, claims and conversation reads cancel departed
actors under counter/Run locks, revoke their fences and close attempts, queued
backups, cards and open tools. Attempt writes and heartbeats require current
membership. Maintenance uses Space selectors, never fabricated membership scopes.

Memory revision references are stored in `conversation_run_memory_pins`, with
same-Space checkpoint/revision FKs. Checkpoint JSON stores accepted context and
provenance only; claims hydrate ordered pins. Later checkpoints cannot replace
accepted memory or recreate references removed by physical source deletion.

Group conversations expose create/list/get/rename, Agent participation, default responder
and delete procedures. Explicit mentions route member sends per Agent; unaddressed
group messages create no Run. Participating Agents share the counter, with bounded
attributed history and untrusted provenance for other speakers. Agent messages retain
the originating member, message root and bounded chain/budget. Agent identities and
participant rows are retained as tombstones for historical same-Space references.
Delegation is a durable Run child in the same conversation, with fenced, deduplicated
intents and checkpointed result delivery. Child text stays in activity, not replies.

Phase 5 composes injected Page, skill and remote tool adapters with the same approval,
effect, lifecycle and attempt fence path. Built-in names remain a closed catalog;
remote names use a separately validated open type. Skill metadata and credential-free
remote tool catalogs are frozen in checkpoints; recovery revalidates current access
without replacing accepted metadata. Body loads remain bounded untrusted reference text.
`toolDisplayLabel` in `/model` shares built-in catalog keys and bounded remote tool
labels with DOM and Mobile. Approval projections preserve open exact tool names;
settings list exact rules with removal and discover remote rule choices by testing a member-owned server.
`McpServers` owns remote HTTP server forms and transient test outcomes; credential headers
stay outside observable drafts and are consumed on every submission. Optional `skills` and
`mcpServers` workspace ports provide per-member, per-Agent enablement; Native consumers
need not implement them. Tool activity uses an optional Page opener; projections without
a Page ID open only the Pages list; display targets are never parsed as Page IDs.
Live projection preserves the server-produced `page` identity through history
merges. Web/ Desktop open that Page detail; Desktop previews retain the Web handoff.

Queued Run events expose optional trigger/routine/provenance-kind/untrusted-input
metadata without inbound bodies. Snapshot Runs expose the same untrusted boolean.
Agent create/get/update/list and every Conversation projection always populate
nullable `lastActivityAt` from the newest sequenced event through the covering
activity index. No retained event means null; metadata edits preserve activity.
The wire field stays optional for existing consumers; list order remains unchanged.

`conversations.history` reads bounded message-sequence windows (1–100 messages),
with scoped exclusive older cursors independent of event replay cursors. Associated
Runs/segments cap at 500, tool/approval summaries and member directories at 100,
with explicit truncation flags. Snapshots retain their full-history default and
add bounded resolved-answer and email-free historical member projections.

Snapshot/history `activeRuns` is an independently bounded (100) Space/conversation
projection, including trigger message position, up to 16 pending card summaries
and the latest committed segment position. It contains no request arguments.
The shared model merges those Runs outside its loaded message window and applies
state, segment and card events before ACK. `run.state.triggerMessage` identifies
old-trigger and delegated work without guessing from the most recent message.
DOM and Mobile show this work above the composer with direct Stop, approval,
steering and a bounded trigger-page jump; loading its message hides the strip row.

Space-owner HTTP API management sits beside remote servers in Tools.
`OpenApiServers` scopes requests to the selected owned Space, imports JSON/YAML or
fetches once, then enables explicit operations for all or selected Agents.
Credentials stay outside observable drafts and clear on submit and unmount.
OpenAPI card/activity labels use bounded summaries and classify GET/HEAD as reads.
Exact names remain rule identities; members can choose registered operations for
Allow/Block settings using safe metadata. API effects use the existing inspector.

Exact strip steering uses optional `send.message.steerRunId`, rather than choosing
a Run from its Agent name. The selected target is visible/cancellable and is frozen
in uncertain-send receipts. A terminal target preserves the draft with a safe
`RUN_NOT_ACTIVE` error; membership and conversation checks remain server-owned.
