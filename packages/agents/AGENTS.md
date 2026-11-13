# @raypx/agents

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
ACKs and fresh membership checks. Execution and provider credentials stay outside.
With no Runs, computers or stored objects in these slices, deletion is synchronous;
add the resumable deletion workflow before those resources become dependents.

Use public workspace entries and `.js` relative specifiers. Unit tests live beside
source. Run `bun run --cwd packages/agents check` and `test`. `test:postgres`
selects `tests/postgres/` and requires a newly provisioned disposable `*_test` database.
