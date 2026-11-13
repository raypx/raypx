# Conversations and the event stream

An Agent has one continuing conversation. Internal Runs and attempts are
implementation detail. This guide covers what a conversation stores and how
clients follow it.

## Conversations

- A direct conversation belongs to one Agent. A group conversation has several
  Agents and the members of its Space.
- In a group, a message reaches the Agents it mentions. An Agent can address
  another Agent in the same Space. Cross-Space messages need an explicit setting
  on the Agent.
- A pending question or approval card never blocks a conversation. A member can
  keep chatting, and the card stays answerable until someone entitled answers it.
- The conversation list has a regular view and an activity view. Activity shows
  Runs and their tool use. Chat shows replies, useful progress, results and
  requests for help.

## Events

Each conversation has one ordered event log in PostgreSQL.

| Event kind        | Carries                                          |
| ----------------- | ------------------------------------------------ |
| `message.created` | A member, Agent or trigger message               |
| `reply.segment`   | A completed segment of reply text                |
| `card.created`    | An approval, a question or a result card         |
| `card.resolved`   | The answer and who gave it                       |
| `run.state`       | A Run's state change                             |
| `tool.started`    | Bounded target and argument summary for a call   |
| `tool.finished`   | Stable outcome, duration and command exit status |
| `computer.state`  | A computer's start, stop or unavailable state    |

- A per-conversation counter assigns each event a sequence number in the
  transaction that writes it. Sequences have no gaps.
- An event is immutable. A correction is a new event.
- Reasoning text, working placeholders and hidden metadata are not events.

## Streaming

- Reply text streams to connected clients as transient deltas. Deltas are not
  stored one by one.
- When a segment completes, the owner commits one `reply.segment` event with the
  full text. A client that reconnects mid-segment receives the committed text and
  then the live deltas that follow.
- The first visible response is committed in the same transaction as its event.

## Transport

- Clients open one authenticated WebSocket to the backend. A client subscribes to
  the conversations of the Spaces it has joined.
- A client reads from a cursor and acknowledges what it has applied. The server
  resumes from the acknowledged cursor on reconnect.
- A gap between the cursor and the oldest retained event forces a snapshot. The
  client replaces its state with the snapshot and then resumes incremental events.
- The server checks membership when a subscription opens and again when a
  membership changes. A removed member's subscriptions close.

## Fanout

- A process that commits an event notifies the others with PostgreSQL
  `LISTEN/NOTIFY`. The notification carries a conversation identifier and a
  sequence, never content. Each process reads the event from the database.
- A configured Redis broker replaces `LISTEN/NOTIFY` for larger deployments. An
  explicitly configured broker must be healthy.
- A missed notification is harmless: a client's next read from its cursor returns
  everything committed.

## Notifications

A Run that finishes, or that needs an answer while no client is connected, sends a
push notification through an optional notification port. The notification carries
a title and a conversation identifier. It carries no message content unless the
member enables previews.

## Implemented conversation slice

`@raypx/core/conversation` defines member messages and the immutable
`message.created`, `run.state`, `reply.segment`, `computer.state`, `card.created`
`card.resolved`, `tool.started` and `tool.finished` event variants. Events reference the stored message or segment; cursor
reads hydrate that message for transport. Run state events contain only the Run ID, state and a stable failure code. Snapshots include messages, Runs and completed reply segments.
`@raypx/agents/server` owns scoped conversation persistence and the small fanout
subscriber port. The PostgreSQL repository accepts a transactional publisher;
its default calls `pg_notify` inside the write transaction, so rollbacks publish
nothing. Notifications contain exactly `conversationId` and `sequence`.

`conversations.send` accepts a resource selection and `{ text, idempotencyKey }`.
The key is scoped to Space, Conversation and session member. Retrying a key returns
the original message, even if retry text differs or its event was compacted.
One counter-row lock serializes writers and prefix retention; failed transactions
consume no sequence. A new send commits the member message, a queued Run and
`message.created`/`run.state` events in one transaction. A retry creates neither a
second message nor a second Run. After commit, the process schedules an independent
task; the request does not await the model. The Run uses the Agent model and
instructions captured by that transaction.

`conversations.events` reads `after` (default 0) with `limit` from 1 through 100.
It returns ordered `{ event, message? }` entries (only `message.created` carries a hydrated message; `reply.segment` embeds the completed segment), the last returned cursor and
`hasMore`, or `status: snapshot-required`. Future cursors are rejected.
`conversations.snapshot` returns Conversation metadata, all current messages, Runs, completed segments and
a resume cursor while holding the conversation counter across state/cursor reads.
Reads persist departed-actor cancellation under that same lock. Event retention is indefinite
by default. The internal `retainAfter` maintenance operation removes only a prefix
and persists its floor even when no events remain. Message history and retry keys
remain available. There is no scheduled retention policy in this slice.

API-enabled roles mount `/events` on the existing Hono/CrossWS listener. Upgrade
requires the normal account session and an allowed Origin when one is present.
Credentials never appear in the URL. The server sends `{ type: "ready", version: 1 }`.
Conversation client frames carry `version: 1`, `spaceId` and `conversationId`:

- `subscribe` supplies `after`, the client's persisted applied cursor.
- `ack` supplies `sequence`, exactly matching the event just applied.
- `unsubscribe` releases the subscription and any pending ACK wait.

An `event` frame contains one hydrated entry. Each of at most 32 subscriptions has
one event in flight and a ten-second ACK deadline, using the same AcknowledgedStream
as the CLI. Clients persist applied state and its cursor together, ACK it, and
resubmit that cursor on reconnect. The server never sends an event at or below
the supplied cursor. An event not yet applied/acknowledged remains replayable;
there is no claim of exactly-once delivery across a lost ACK.

A `snapshot-required` frame carries the selected identifiers and current cursor,
and releases that subscription. The client fetches and applies the snapshot, then
subscribes using the snapshot's cursor. LISTEN hints wake database reads; a
one-second repair poll covers missed notifications. Session and Space membership
are resolved again before delivery and during idle/ACK waits. Removal closes the
connection with 4003; authentication loss uses 4001. Invalid frames/cursors/ACKs
use 4000, unavailable storage uses 1013, and shutdown uses 1001. Socket and query
bounds apply independently. No message text, account credentials or event content
is published on the notification channel or written to logs.

## Approval cards

Both card events carry the usual `spaceId`, `conversationId`, `sequence` and
`createdAt`, plus `requestId`, `runId`, `toolCallId`, `toolName`, `argumentSummary`, `target`,
`memberAccountId` and `expiresAt`. Summary and target are at most 1,024 UTF-16 code
units. `card.resolved` also carries `outcome` (`approved`, `denied`, `expired` or
`cancelled`) and nullable `answeredByAccountId`. Exact arguments, file contents,
command output and credentials never enter these events.

Creating a request writes `card.created` then `run.state: waiting` atomically.
Answering or expiration writes `card.resolved` then `run.state: running` unless
the Run is already terminal. Stop writes cancellation and pending-card resolutions
in one transaction. They use the same counter, fanout, replay and ACK protocol as
other events, without another stream version. After a snapshot, clients can read
current addressed requests through `approvals.pending`; snapshots do not embed
request arguments or effect results. Live approval handling still requires the
single API-enabled execution process.

## Live replies in phase 1

The shared Agents model applies snapshots and consecutive event sequences before
acknowledging. Duplicate events are harmless; gaps request a fresh snapshot.
Transient deltas require adjacent UTF-16 offsets and converge to the committed
segment. Missing offsets reconnect for a fresh prefix. The UI retains its draft
through connecting, live, reconnecting and snapshot-required states, labels queued
member messages and terminal failures, and offers explicit stop and retry editing.

The initial reply executor and its `/events` subscribers share one API-enabled
backend process. The existing PostgreSQL fanout still distributes committed events;
live prefixes are process memory, with no content on LISTEN/NOTIFY. Multi-process
transient distribution is outside this slice; use one API-enabled process for
Conversation model execution until that port is added. Relay may remain separate.

After replay reaches the current durable cursor, the server sends `reply.prefix`
with `spaceId`, `conversationId`, `runId`, `segmentId`, `offset: 0` and the whole
open text. Subsequent `reply.delta` frames carry the same identifiers, an offset
in UTF-16 code units and text to append at that offset. Deltas may be coalesced
while replay is awaiting ACKs. Prefix capture and offset registration occur
synchronously, so a joining subscriber cannot miss a concurrent append. Every
delivery still rechecks authentication and Space membership.

Transient frames neither advance nor require an event ACK. Clients replace a
segment's draft on a prefix, require adjacent offsets for appends, and replace it
with the full `reply.segment` when that event arrives. A terminal failed or
cancelled `run.state` clears any uncommitted draft. A successful model turn is one
segment, limited to 32,000 UTF-16 code units. Reasoning and tool-call content are
never published. Errors or stops discard incomplete text; completed segments stay
in snapshots after event retention. A socket joining during completion gets either
the prefix and following appends, or the committed segment through cursor replay.
The first visible text timestamp is captured in memory and written to the Run in
the segment/event transaction.

## Tool lifecycle

Every call, including reads and refusals, commits `tool.started` with the model
turn's pending-call checkpoint, before policy or execution and `tool.finished` on a durable outcome. Both contain `runId`,
`toolCallId`, `toolName`, `target` (path or executable) and `argumentSummary`.
Targets and summaries are bounded to 1,024 UTF-16 code units. Summaries include
only an operation, path/cwd and argument count; never full arguments, file content
or command output. Finish adds `outcome` (`succeeded`, `failed`, `refused`,
`cancelled` or `unknown`), `durationMs` and nullable `exitStatus`. Exit status is
present for confirmed command exits and survives result truncation. Duration is
wall time since the original call start, including approval/recovery waits, capped
at 2,147,483,647 milliseconds.

A Space-owned lifecycle row keyed by Run/tool-call ID deduplicates events even
when the event prefix has been retained away. Writes validate the attempt fence
under the conversation counter lock. Member effect reads also take the current
Run lock and use its stored fence when observing lazy expiry, without requiring
a live attempt. An effect's completion or transition to unknown commits its
finish event in the same transaction. Reads and refusals
commit finish with the tool-result checkpoint. Stop closes open calls as
cancelled in its cancellation transaction. A handover preserves open calls.
Approval cards expose the same `toolCallId` for correlation.

Snapshots add `toolActivity` (at most the newest 100 lifecycle rows, returned in
start order) and `toolActivityTruncated`. Each row contains the shared summary
fields, `startedAt`, nullable `finishedAt`, `outcome`, `durationMs` and `exitStatus`.
This projection survives event retention and contains no tool results.

## Routine events

`routines.events` returns immutable `routine.fired` and `routine.coalesced`
records from the routine occurrence transaction. Both contain only `id`,
`spaceId`, `routineId`, `occurrenceId`, `runId`, `conversationId`, `dueAt` and
`firedAt`, plus `kind`. They are ordered by firing time and ID. A replayed delivery
returns its original outcome and adds no event. Coalescing links the later
occurrence to the existing pending Run. These records and structured logs contain
identifiers and times only. The existing conversation stream still receives the
normal `message.created` and `run.state` events with no new event variants.

Card event references include `(space_id, conversation_id, run_id, request_id)` and
point to the same tuple on `approval_requests`. Requests retain their Run actor
binding after member/account removal; cancellation/resolution changes their state
and appends events instead of deleting their identity. No deletion convenience
removes the Space foreign key. Routine events also bind their selected Run to the
same occurrence through a composite key.

## Space membership events

`/events` also accepts `space.subscribe` with `{ version: 1, spaceId, after }`,
`space.ack` with `{ version: 1, spaceId, sequence }` and `space.unsubscribe` with
`{ version: 1, spaceId }`. Space and conversation subscriptions share the 32-slot
bound, session admission and ACK deadline, with independent cursors.

The server sends `{ type: "space.event", spaceId, event }`; `conversationId` is
absent. The event contains `{ id, spaceId, kind, payload, createdAt }`:

| Kind                        | Payload               |
| --------------------------- | --------------------- |
| `space.member.joined`       | `{ accountId }`       |
| `space.member.removed`      | `{ accountId }`       |
| `space.member.role_changed` | `{ accountId, role }` |
| `space.renamed`             | `{ name }`            |

`id` is an ordered replay/ACK cursor, not a gap-free conversation sequence. Space
events have indefinite retention and can also be read through `spaces.events`.
Apply each event and its cursor together, then ACK its exact ID. These events
never extend the existing conversation event union.

The membership transaction publishes a content-free `raypx_space_events` hint.
Removal actively aborts all affected open sockets, including conversation-only
subscriptions and idle ACK waiters. A deletion claim likewise closes the Space's
subscribers. Both use 4003; the internal deletion hint is not a public event kind.
The repair poll remains a fallback when notifications are missed.
