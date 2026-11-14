# @raypx/agents

Graphical tools (`computer_screenshot`, `computer_pointer`, `computer_keyboard`)
require advertised provider support. All record effects; screenshot effects hold
metadata only while a bounded untrusted image enters private model context and
checkpoints. Images never enter events, activity or logs. Recovery without an
image requires a new capture. Input waits behind PostgreSQL member control before
effect intent; fenced `computerInputPaused` uses the existing waiting Run state.
Commands on screen-capable providers share this gate because commands can inject
graphical input. Files and screenshots remain readable during member control.

Backend groups use explicit mentions, retained participants and one gapless
conversation counter across concurrent Agents. Native `agent_send_message`,
`agent_delegate` and `agent_wait` tools keep the originating member's authority;
delegation intent/results and instruction revisions are durable. Child Runs
produce parent-tagged activity, without visible child replies. Per-Agent Computer
operations use a fenced gate independently of concurrent model work.

`/model` owns pure Space/Agent page selection, the conversation projection and its
injected RPC, stream and draft ports. ComputerController owns the Space computer
lifecycle projection, guarded commands and refreshes from events/reconnects. Applied state and cursor advance together;
React lives only in `/client`. `/model` also exposes the existing structural
mention helpers and foreground Space live controller for native consumers. Web and Desktop consume that shared workspace. The shell owns its single title.
The sidebar is the sole directory: quiet New, collapsible Agent/group/Space/recent
sections, one Create Agent action when empty, and owner invitations under the account.
When the sidebar is a rail, empty home owns that sole Create Agent action; Pages
retains sidebar creation. The Agent name filter opens/focuses a shared input;
Escape clears its query, then closes and returns focus. The rail keeps every Agent
reachable regardless of the retained expanded-sidebar filter.
Recent derives from existing `lastActivityAt` list projections; no transcript previews
or invented notification data are stored. A last-used Agent preference is scoped by
origin, account and Space. The centered home composer uses the same device draft and
idempotent-send controller without starting an invisible transcript. Sending opens
that Agent conversation. `onOpenTools` and `onNewConversation` adapt app navigation;
`renderWorkspace` keeps the directory around Pages. The conversation fills remaining
width with a centered reading column and floating composer. The sticky toolbar owns
Conversation/Activity/Files text tabs and context actions; below 640px tabs occupy a
second row. Replies are plain Markdown and member messages are compact bubbles.
Completed replies keep quiet actions and collapsible real steps, effects and delegated
work. Pending approvals appear once above the composer with active Runs.

A quiet right rail holds the computer/Screen and capability shortcuts at wide widths;
narrow layouts use sheets. Routines and Space memory use injected optional ports.
`CapabilitySheet` owns heading focus, one-Escape closure and return to the visible
opener. Screen retains its independent Escape-release and expanded-dialog rules.
Computer Stop requires confirmation. Model conversation rows keep reply identity
and reading anchors stable through streaming/commit. Announce lifecycle and approval
changes without announcing tokens or deadline ticks. Direct replies omit sender names;
optional sender context supports groups. Enter sends, Shift+Enter inserts a newline,
and IME owns composition. Toolbar portals use viewport breakpoints.
Run metadata adds optional trigger/provenance fields for Mobile compatibility.
Live Run metadata hydrates from snapshots without replacing the event cursor or live text.
`/messages/en` and `/messages/zh` own the `agents` catalog; `/client/styles.css`
registers Tailwind sources only. Component tests use happy-dom and
`*.component.test.tsx`; `test:unit` selects the pure model and server suites.
Drafts and frozen uncertain-send receipts stay on the device, scoped by origin,
account, Space and Conversation. Restoration and failed-Run retry only restore
editing state. Never resend without an explicit action or render provider content as HTML.

`/server` exposes database-free repository ports and Agent/Conversation projections.
`/server/postgres` implements persistence. Agent execution stays in the backend; device I/O uses the Computer port. Core owns the
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
Auto uses an injected, tool-less review model with a fixed server prompt, bounded
input/output, five-second timeout, confidence threshold and eight durable claims
per Run. The approval request claims review before inference; interrupted claims
ask without another model call. Verdicts, bounded reasons, timing and fences remain
on the addressed request and resolved event; same-Space keys bind eventual effects.
Stop/fence checks and fresh mode/Block/provenance checks guard verdict commits.
All tool results, recalled memory, enabled skill/remote metadata and other-member
history taint the checkpoint. Changes after steering ask. Completed effects replay;
unexecuted automatic decisions under changed authority need a new member request.
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

Auto availability comes from server settings. `/model` exports the revisioned
ApprovalSettingsController for DOM and native account mode pickers. Approval
projections retain bounded review evidence through events and history; terminal
review decisions with no member answer show automatic attribution and the reason
as plain text. A replacement member request and its answer supersede the earlier
automatic status for the same tool call without deleting review evidence. Member
answers keep their own attribution.

Exact strip steering uses optional `send.message.steerRunId`, rather than choosing
a Run from its Agent name. The selected target is visible/cancellable and is frozen
in uncertain-send receipts. A terminal target preserves the draft with a safe
`RUN_NOT_ACTIVE` error; membership and conversation checks remain server-owned.

Device computer selection/list/grants use `DeviceComputersController` and injected
ports; DOM and Mobile render the same account/Space-scoped projection. Settings
never confirm host directories. Device cards retain bounded device/directory and
complete command metadata through events and outside-window summaries. Device
commands require exact Allow or a member answer even in Never ask, and never use
Auto review. Permission is checked again after the Computer driver wait; a removed
Allow refuses before effect intent without holding a driver for another card.
Recorded outcomes still replay. Initial untrusted recall is pinned before device
admission, and an inherited team-computer pin never enters the device-only guard.

Protected input is separate from approval. The runner waits durably before effect intent, then consumes and erases an encrypted envelope before dispatch. Canonical call hashes bind recovery. The shared metadata controller and masked form retain no values; Stop/terminal completion erase unused envelopes. Commands scrub exact echoes before serialization. Auto never reviews protected operations.

Protected destinations include command environment/stdin, HTTP bearer/API-key/basic and declared remote tool headers. Two basic fields are masked and cleared together. Remote header declarations are credential-free configuration; protected values never enter observable drafts.

MessageAttachmentsService owns validation, transactional upload claiming and
fenced inbox/image delivery. Notification service queries PostgreSQL sources;
models expose injected upload/feed ports. Drafts never persist bytes or restart
uploads. DOM chips, menu/drop/paste and sidebar bell share these models.

ComputerController retains value-free admission reasons for the failed generation
through racing events/refreshes. DOM and Mobile render the shared en/zh catalog;
successful lifecycle state clears the reason. Screen runtime reasons use the same
catalog on Web/Desktop; Mobile has no Screen surface.

Settings categories use Blocks navigation; notifications group actual sources by
Space with relative time and explicit unread state. Attachment thumbnails use only
authenticated bounded downloads. Files keeps breadcrumbs and tree keyboard controls;
only untruncated reads can be downloaded. Remote display labels omit opaque server
identities while exact policy identities stay unchanged. Historical audit fallbacks
never display internal member or resource IDs.
