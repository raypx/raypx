# ADR-0017: Fenced execution Gateway and immutable task rounds

## Status

Accepted. Refines execution, budget and review rules in
[ADR-0016](0016-cloud-agent-platform.md).

## Context

An in-process Worker shares credentials with its Agent and a crash can interrupt
every Run. A Task-wide budget cannot distinguish retrying an attempt from starting
a new delivery goal. Completion, cancellation and review need one durable result.

## Decision

Worker hosts are independent instances. Each atomically claimed Run has a unique
owner and fencing epoch, a 30-second lease and renewal every ten seconds. Hosts
recover expired owners only. An expired lease cannot be renewed or resurrected.

Each Run receives a separate Node Runner with an explicit environment and a
durable hashed RunGrant. API owns the private execution Gateway, model/search
credentials and actual request dispatch. Every operation checks the current
grant, lease and resource permission. Inputs cannot change identity, scope, owner
or epoch. File transfers verify actual bytes and authorized object keys. Trusted
provider settlement can amend only its durable usage intent after a Run ends.

TaskRound freezes goal, attachments and budget. Retry and continue reuse the
round; starting a new goal creates a new round and goal version. Artifact
revisions belong to a round. Acceptance compares current round, goal version and
revision and requires no active Run. SQL enforces one active main Run.
Cancellation and publication serialize on the same Run/Task lock.

React apps use request-local TanStack Query for ordinary resources and Client
Sessions for active Run/Conversation facts. Bootstrap snapshots contain durable
message projections and bounded events; old history loads separately. Commands
and terminal transitions invalidate specific queries once. Actor, account, scope,
resource and file-version identities isolate caches and temporary URLs.

## Consequences

The private protocol is exported separately from public contracts. Pi remains
inside the AI adapter; Runner SDK streaming delegates to Gateway transport.
Process isolation provides fault containment and credential separation. It does
not authorize arbitrary code, browser control or host access.

## Follow-up

Introduce an execution driver and security sandbox before arbitrary code or
browser/GUI operations. Validate providers, S3 and final-container behavior in a
configured release environment.
