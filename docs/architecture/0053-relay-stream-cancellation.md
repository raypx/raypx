# ADR 0053: Acknowledged streams and cancellable Relay connections

Date: 2026-11-10

Status: Accepted

## Context

Managed task replay and observed terminal projections independently implement
acknowledgement, timeout and reset. Lifecycle generation counters discard some
late results but do not cancel pending work; a reconnect inside a socket client
can also leave work from its previous handshake running.

## Decision

Both Relay channels use one private acknowledged-stream primitive. It owns an
exact cursor, one pending acknowledgement, a committed cursor, a cancellable
deadline and reset. A reset rejects the old waiter before a new exchange starts.
Late acknowledgements and old deadline callbacks cannot settle a replacement.
Journal replay and snapshots remain owned by the managed task engine; observed
wire revisions remain monotonic across connection resets.

Each actual authenticated socket connection owns an AbortController. Dropping or
replacing it aborts pending projection reads, acknowledgement waits and writes to
that connection. Account selection and binding lifetime have separate cancellation
scopes for authorization/renewal. Every asynchronous continuation checks or races
its scope; abort releases the caller even when an injected adapter ignores its
signal. Pure state machines describe phases and guard transitions, not lifecycle
generation counters.

Transport cancellation never retracts an already accepted persistent Agent
command. It suppresses its obsolete response; the durable command receipt and
journal make its result available after reconnect. Explicit detach retains its
existing execution cancellation semantics.

## Consequences

Managed and observed streams share acknowledgement mechanics while preserving
their current wire protocol. Replacement races are tested with deliberately
uncooperative adapters, stale acknowledgements and deadlines, and accepted tasks
surviving transport loss.
