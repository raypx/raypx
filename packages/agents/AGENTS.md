# @raypx/agents

`/model` owns pure Space/Agent page selection, the conversation projection and its
injected RPC, stream and draft ports. ComputerController owns the Space computer
lifecycle projection, guarded commands and refreshes from events/reconnects. Applied state and cursor advance together;
React lives only in `/client`. Web and Desktop consume that shared workspace. The shell owns its single title;
list/detail panes fill the tool layout, with a scrolling transcript and fixed composer.
Space selection and New Agent mount into sidebar slots. The conversation header
opens the lifecycle-only computer panel: a sheet below 1280px, an inline side panel
at wider widths. Stop requires confirmation; tools and approvals remain unimplemented.
Model conversation rows keep reply identity/order stable from queue through commit.
The client reuses Blocks Markdown, keeps reading anchors, and announces Run lifecycle
changes only. Enter sends, Shift+Enter inserts a newline, and IME owns composition.
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
Snapshot and cursor reads use repeatable-read transactions. Prefix retention keeps
messages and advances the replay floor atomically. API owns socket lifecycle,
ACKs and fresh membership checks. Sends also create a pinned queued Run and state
event. `/server` owns ConversationRunner, the injectable member-aware ModelAccess
port and process-local LiveReplies prefixes. It uses the public AI transport and
serializes each Agent's queued Runs, including a Run waiting for approval. The
bounded model/tool loop uses the injected Computer port; no provider means no
offered tools. Account approval settings and exact tool/executable rules gate
changes; pending requests bind exact arguments to the initiating member. Card
events carry bounded summaries and omit file contents. Effect intents precede
changes, completed outcomes are reused, and unknown outcomes block continuation.
Runtime construction performs no effect I/O. Reads and effect decisions atomically
age intents into unknown after TOOL_DEADLINE_MS plus the shared safety margin;
young intents remain in progress. There is no startup scan or Run recovery.
Stop commits cancellation and pending-card resolution before aborting model
and computer work; segment output and first-response time commit together. No
leases, attempts, retries or recovery exist yet. API owns credentials and configuration.
Deletion still cascades synchronously; active Run status checks abort deleted work.
Computer owner references restrict deletion until a resumable workflow releases them.

Use public workspace entries and `.js` relative specifiers. Unit tests live beside
source. Run `bun run --cwd packages/agents check` and `test`. `test:postgres`
selects `tests/postgres/` and requires a newly provisioned disposable `*_test` database.
