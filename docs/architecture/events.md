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
