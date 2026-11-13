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

| Event kind        | Carries                                       |
| ----------------- | --------------------------------------------- |
| `message.created` | A member, Agent or trigger message            |
| `reply.segment`   | A completed segment of reply text             |
| `card.created`    | An approval, a question or a result card      |
| `card.resolved`   | The answer and who gave it                    |
| `run.state`       | A Run's state change                          |
| `activity`        | A tool call summary for the activity view     |
| `computer.state`  | A computer's start, stop or unavailable state |

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
`message.created` event variant. Events reference the one stored message; cursor
reads hydrate that message for transport. Future variants ship with their writers.
`@raypx/agents/server` owns scoped conversation persistence and the small fanout
subscriber port. The PostgreSQL repository accepts a transactional publisher;
its default calls `pg_notify` inside the write transaction, so rollbacks publish
nothing. Notifications contain exactly `conversationId` and `sequence`.

`conversations.send` accepts a resource selection and `{ text, idempotencyKey }`.
The key is scoped to Space, Conversation and session member. Retrying a key returns
the original message, even if retry text differs or its event was compacted.
One counter-row lock serializes writers and prefix retention; failed transactions
consume no sequence. Sending does not invoke a model or schedule a Run.

`conversations.events` reads `after` (default 0) with `limit` from 1 through 100.
It returns ordered `{ event, message }` entries, the last returned cursor and
`hasMore`, or `status: snapshot-required`. Future cursors are rejected.
`conversations.snapshot` returns Conversation metadata, all current messages and
a resume cursor from one repeatable-read snapshot. Event retention is indefinite
by default. The internal `retainAfter` maintenance operation removes only a prefix
and persists its floor even when no events remain. Message history and retry keys
remain available. There is no scheduled retention policy in this slice.

API-enabled roles mount `/events` on the existing Hono/CrossWS listener. Upgrade
requires the normal account session and an allowed Origin when one is present.
Credentials never appear in the URL. The server sends `{ type: "ready", version: 1 }`.
Client frames all carry `version: 1`, `spaceId` and `conversationId`:

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
