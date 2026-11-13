# Run execution and recovery

A Run is one unit of Agent work. Pi executes it inside the backend process. This
guide covers how a Run starts, how one process owns it, and how it recovers.

## Implemented durable backend

The backend implements message-triggered Runs with `queued`, `running`, `waiting`,
`succeeded`, `failed` and `cancelled` states. PostgreSQL stores their leases,
increasing fences, execution attempts, canonical checkpoints, steering messages
and keyed backup jobs. `@raypx/agents/server` owns the runner and injected ports;
`/server/postgres` owns their transactional persistence. API and worker roles use
that same runner. Nothing imports the retained private CLI harness.

A send transaction locks the conversation counter, commits the member message,
creates its Run and backup job, and publishes a content-free notice. After commit
the request process starts the Run directly, independently of the HTTP request's
AbortSignal. A running or approval-waiting Run receives later messages as durable
steering instead of creating another Run. Messages arriving before any Run has
started can still create queued Runs; the earliest trigger starts first. A partial
unique index keeps one running or waiting top-level Run per Space/Agent. Child
Runs may perform model work concurrently; a separate fenced gate serializes
their computer operations with the parent's operations.

The first claim pins the Agent's opaque model ID and instructions. Model access
pins a connection fingerprint over the deployment provider, exact model and
credential selector, or the member connection identity, kind, endpoint, protocol
and exact model, without storing the key. Rotating the key under that same
connection is allowed; removing access to or remapping a pinned connection fails with
`CONNECTION_UNAVAILABLE`. A configured Computer provider starts and pins the
Space team computer and generation before execution; recovery validates that
identity without provisioning a replacement. A missing pin fails with
`COMPUTER_UNAVAILABLE`; a missing model fails with `MODEL_UNAVAILABLE`.
Computer pins are historical scalar ID/generation pairs, validated against the
same Space when pinned, rather than foreign keys that prevent deleting a selected
resource. A later missing resource therefore reaches that explicit failure.

Every claim is a conditional atomic update of owner, lease expiry and fence. It
adds a new Attempt and refreshes the backup job in the same transaction. Each
process has a unique instance ID. Heartbeats extend only an unexpired matching
lease. All attempt mutations lock and validate the Space/Run owner, fence and
expiry, including events, checkpoints, effects, approval creation and resource
pins. Member stop/approval answers remain separate authorized intents. An older
attempt cannot overwrite a newer attempt or revive cancellation.

After a model turn, one transaction stores its completed reply segment, ordered
event, first-response time and canonical checkpoint. The checkpoint contains the
canonical continuation, pending calls, round count and open-effect keys; effect
rows remain authoritative. Each completed tool result advances the checkpoint.
Recovery reuses completed effect outcomes if a crash preceded that advancement.
An unfinished intent remains blocked until the existing tool deadline plus margin
classifies it as `unknown`; unknown outcomes fail with `EFFECT_UNKNOWN` and are
never replayed automatically. Approval requests and their exact arguments stay
durable. A resumed pending call reuses its existing request, so an answered card
continues after executor replacement without asking again.

`conversations.stop` cancels the Run and pending cards atomically, then aborts
model calls and Computer work. Heartbeats also detect stop committed by another
process. Shutdown instead stops claims, aborts in-flight calls, preserves pending
cards/checkpoints and releases leases with a fanout notice; it does not record
`cancelled`. Another worker can claim immediately. A crashed owner is eligible
when its lease expires. Startup scans belong to worker `start()`, never runtime
construction. Fanout hints wake scans; the interval repairs missed notifications.

The backup queue is a Space-owned PostgreSQL table keyed by Run, claimed in due
order with `FOR UPDATE SKIP LOCKED` and a bounded job lease. It is separate from
`@raypx/jobs`, whose retained account/device schedules do not provide a general
keyed delayed retry queue. It is never normal dispatch. Terminal completion
removes the job. A transient model error releases the attempt and moves the job
to the provider's retry time, otherwise exponential backoff of 1–60 seconds, with
transient retry allowed only while the execution attempt count is below five.
Handover and crash recovery also add attempts. The original process schedules the direct
retry timer. Crashes leave the backup due at the attempt deadline plus margin.

The bounded Computer loop still offers only list, read, write and executable/argv/
cwd commands. It permits eight tool rounds and sixteen calls per round. Results
are bounded untrusted data, commands have a 60-second deadline, and no backend
host execution or implicit shell is introduced. No configured provider means no
tools. Steering is consumed in message-sequence order at the next model boundary,
including after an approval's pending calls finish. Stop discards further work.

### Deployment timing

- `RUN_RECOVERY_INTERVAL_MS`: 5,000 by default; startup and periodic worker scans.
- `RUN_LEASE_MS`: 15,000 by default.
- `RUN_HEARTBEAT_MS`: 5,000 by default, at most half the lease duration.
- `RUN_ATTEMPT_TIMEOUT_MS`: 300,000 by default, including approval waits.
- `RUN_BACKUP_MARGIN_MS`: 30,000 by default, added to the attempt deadline.

A process cannot declare another owner dead before its lease expires. Clean
handover explicitly clears ownership; a lost direct start has no lease and is
eligible immediately. Recovery latency after a crash is the remaining lease plus
at most the scan interval. No global worker slot or scan sits on direct dispatch.

### Deployment model configuration

API's static environment contract declares two optional JSON strings, empty by
default:

- `AGENT_MODELS`: an array of `{ modelId, provider, model, credentialId }`.
  `modelId` is Raypx's opaque Agent choice; the other selectors exist only in the
  deployment adapter. Provider/model selectors must exist in Pi's default catalog.
- `AGENT_MODEL_CREDENTIALS`: an object mapping `credentialId` to the API key.
  Keep it in protected runtime settings, never a build argument or a domain row.

For example, a catalog entry can map `"assistant-main"` to an exact Pi provider
and model with `"credentialId": "deployment-main"`; the protected map supplies
that credential separately. Do not put deployment selectors in Agent records.
An empty catalog lets API start and serve authentication, CRUD and messages;
a Run using an unconfigured ID fails visibly. Malformed JSON or duplicate opaque
IDs reject startup with a generic configuration error that contains no raw input.
Ambient provider keys are never consulted. Member-owned connections resolve
through the same port using the Run's Space and member identity; see
[connections](capabilities.md#implemented-model-connections). Recovery workers
require the same existing `APP_KEY` as API to decrypt those credentials.

The remaining sections describe the broader execution architecture. Routines,
inbound triggers, delegation and additional model roles
remain future capabilities; phase 2 implements only the backend slice above.

## Dispatch

Work starts at once in the process that creates it.

1. A request commits the message, the Run and a backup job in one transaction.
2. The request returns. The client follows the reply on the
   [event stream](events.md).
3. The same process starts the Run as an independent task.

Routines, webhooks, inbound email, Agent-to-Agent messages and retries start the
same way in whichever process creates them. A Run that is due later starts from a
timer in the process that scheduled it. No queue, scan or shared slot sits between
a due Run and its start, so a slow Run never delays another.

## Ownership

- Starting a Run claims an execution lease with one atomic update. The claim sets
  the owner, an expiry and a new fence number.
- The owner renews the lease with a heartbeat. Every write of an attempt carries
  its fence. A write with an older fence is rejected.
- However many `api` and `worker` processes run, one claim succeeds and the Run
  executes once.
- A message that arrives during an active Run becomes a steering message for that
  Run. It does not create a second Run.
- Stop ends the active attempt, cancels its work on the computer and records
  `cancelled`.

## Attempts and checkpoints

- An attempt is one execution of a Run. A retry or a resume adds an attempt.
- After each model turn the owner commits a checkpoint: the canonical model
  history, the pending tool calls and the open effects.
- A resume starts a new attempt from the last checkpoint. It never replays an
  effect whose outcome is unknown. See [approvals](approvals.md#effects).
- A Run pins its model, connection and computer at its first start. A resume uses
  the same ones. If one is gone, the Run fails with an explicit state.

## Recovery

Recovery is never on the path a new Run takes.

- Each `worker` scans for runnable Runs at startup and every five seconds. It
  starts any whose process died, whose lease expired or whose start was lost.
- A process that is shutting down, or that lacks memory headroom, releases its
  Runs and notifies the other processes. One of them resumes each Run.
- The backup job fires only if the process crashed before finishing. Its due time
  is the attempt's own timeout plus a margin. Success deletes the job. A clean
  failure moves it to the retry time.

## Computers and concurrency

- An Agent uses its computer for one Run at a time.
- A Run that needs a computer another Run holds stays `queued`. The Run that
  releases the computer starts the next one waiting.
- The conversation stays available while a Run waits. A member can keep chatting
  and start work that does not need the computer.
- Execution timing starts after the computer is acquired.

## Delegated work

- An Agent can delegate work. The delegated work is a child Run of the parent, not
  a second visible conversation.
- A child runs independently. The parent keeps answering new messages.
- A child has the tools and permissions that apply to its task. Delegation grants
  no authority the parent lacks and bypasses no approval.
- Results return to the parent. The parent accounts for changed instructions and
  cancellation before it acts on a late result.

### Implemented child Runs

The backend's `agent_delegate` tool accepts `{ task, agentId? }`. Omitted
`agentId` selects the same Agent; another target must be a current participant
of the same group. The child keeps the parent's Conversation, originating member
and provenance. It gains no shared-memory access that the parent lacked. The
child's own Run ID identifies its approvals and activity; requests remain
addressed to the parent's member. Same-Agent children preserve the parent's
model and instructions.

The tool immediately returns the child Run ID. The parent can continue or call
`agent_wait` with `{}`. Waiting yields model work without blocking member sends;
steering interrupts the wait. A parent with outstanding work remains recoverable
until its children settle. Results are bounded structured tool results, delivered
with a matched `agent_wait` call/result pair in the canonical continuation.

`conversation_delegations` binds the parent/tool-call identity to exactly one
child. Creation, backup dispatch and the child activity event commit together.
Result acceptance and the parent checkpoint commit together, preventing a
recovered parent from re-delegating or redelivering a result. A recovered child
uses its existing Run, lease, attempts and checkpoint. Parent cancellation cascades
to descendants, pending cards and open tools. New steering advances an instruction
revision: children under an older revision are cancelled and their results are
discarded. A cancelled parent accepts no result.

Each parent permits four concurrent children, sixteen children in total and three
levels of nesting. Limit refusals are stable tool-result codes. Model work runs
independently; only Computer port operations acquire the per-Agent driver gate.
The gate uses the current Run lease/fence and an Agent-row lock, so it also
coordinates separate executor processes and conversations. Approval and result
waits hold no computer slot. Waiting for this gate adds no new public Run state.
Execution timing starts after resource validation, before any later tool wait.
New effect intents are recorded after driver acquisition; recorded outcomes replay
without that gate. Another attempt's young computer effect keeps the driver
unavailable until its uncertainty deadline, including after lease loss.

## Models

- Pi provides model access. A member's Connection supplies the endpoint and
  credential. Raypx adds no model-specific configuration.
- Model roles are `main` and `review`. A third role for screen work is added with
  graphical computers.
- A provider error with a retry time schedules the next attempt at that time.
  Other transient errors use bounded backoff. A change of model never happens
  silently.

## The queue

The queue is a PostgreSQL table claimed with `SKIP LOCKED`. It holds backup jobs,
scheduled jobs and maintenance jobs. It provides keyed jobs, a run-at time, retries
and backoff. It is never the normal path for starting a Run or a model call.

## Timing

Structured logs record `run.execution_started`, `run.first_response` and
`run.finished` with durations in milliseconds. `waitBeforeCreationMs` is zero for
current message triggers; `waitBeforeStartMs` measures creation to the original
first start. `firstResponseMs` measures that first start to the first visible
response, and `totalMs` measures that first start to terminal completion, including
resumes and retry waits. `durationMs` retains the operation's corresponding wait,
first-response or total duration. Execution-start logging follows Computer
acquisition. The first-response timestamp commits with its event and checkpoint
and is not replaced on resume. Logs carry identifiers and durations only, never
message, prompt, tool result, arguments, file contents or credentials.

## Routine and memory context

Routine Runs enter the same queued Run, direct-dispatch, lease, checkpoint and
backup-job path as member messages. Their actor is the routine's owner at
acceptance. `routine`, `webhook` and `email` are additional trigger values;
repository events use `routine` plus private inbound provenance. The Run keeps its
original due instant and IANA time zone; routine IDs reference same-Space identity
tombstones that outlive an active definition and its owner membership.
At its first execution start, a delay of at least 900,000 ms produces a timing
annotation with the due time and actual first start in that zone. Both annotation
and original instants are pinned in the checkpoint before model access and reused
on resume. History derives delay from that original start, including coalesced
occurrences without changing the Run's due instant.

Initial recall pins whole memory revisions and their labelled reference context
before the first model call. Later attempts use those pins/context without reading
current memory. External trigger content, earlier inbound conversation context and
recalled untrusted provenance keep write approval mandatory in Ask mode, including
when an exact Allow rule exists. Checkpoints preserve that decision input across
attempts. Context never changes Space admission or credential ownership.

Member/account removal does not prune historical messages or card events from a
surviving shared conversation. Approval rows remain bound to the Run's historical
actor, and card events keep their composite request FK. Current membership still
gates every execution fence and heartbeat. Worker scans
and conversation reads cancel departed actors' active Runs under the conversation
counter and Run locks, revoke leases, remove backups, and append cancellation
state/card/tool events before exposing the updated cursor. A later queued Run can
then acquire the Agent. Runtime construction never performs this maintenance.

Memory revision pins are normalized in `conversation_run_memory_pins`: one scoped
FK references the checkpoint and one references the exact source revision. The
checkpoint JSON stores immutable accepted context and its provenance, not a copied
revision-ID array. Logical remove/restore does not remove old pins. Physical source
deletion removes the corresponding pin relations through CASCADE; it never deletes
the checkpoint or changes accepted context, and later writes do not recreate those
references. A resume hydrates remaining pins in original selection order and uses
the same context bytes without looking up newer memory.
