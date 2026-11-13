# Run execution and recovery

A Run is one unit of Agent work. Pi executes it inside the backend process. This
guide covers how a Run starts, how one process owns it, and how it recovers.

## Implemented phase 1 reply slice

The sections below describe the target execution system. The current Conversation
slice implements message-triggered Runs inside the backend, with `queued`,
`running`, `waiting`, `succeeded`, `failed` and `cancelled` states. It has no Attempt,
lease, fence, checkpoint, backup job, retry or crash recovery. A crashed process
can leave queued/running records; no startup scan resumes them in this slice.

A send transaction pins the opaque model ID and Agent instructions, links the
trigger message and the initiating Space member, and writes the queued state
alongside the message. `@raypx/agents/server` owns the process-local runner and
member-aware model access port. API supplies deployment configuration and the
existing `@raypx/ai` Pi transport. Nothing imports the CLI harness.

A task takes the conversation counter lock, refuses to start when a Run is already
running or waiting, and starts the earliest queued trigger. A partial unique index on
Space/Agent enforces one running or waiting Run. On completion it drains the next queued Run.
A second message queues its own Run; it does not steer the current one. Context
pairs each prior member message with its committed reply, then adds the triggering
message. Inputs queued later are excluded. Each Run's pinned instructions become
the system prompt.

`conversations.stop` takes Space, Conversation and Run IDs through the usual fresh
membership, Origin and quota gates. It atomically cancels queued, running or waiting work,
publishes `run.state`, then aborts the local model request. Repeated stops return
the existing terminal state. A one-second active-Run status check also observes a
stop committed by another process. Conditional output/state writes prevent late
model completion from replacing cancellation. Graceful runtime close cancels and
aborts active model calls before closing the database or model transport.

Missing model IDs fail with `MODEL_UNAVAILABLE`; absent deployment credentials use
`MODEL_NOT_CONFIGURED`. Auth, rate-limit, deadline and other model failures map to
stable domain codes. There is one request attempt and no model fallback. Raw
provider errors, prompts and credentials reach neither events nor logs. Only Run
IDs, stable codes and millisecond timings enter execution diagnostics. The
first-response timestamp persists atomically with the completed segment and event.

### Implemented computer tool loop

When a Computer provider is configured, the backend offers four JSON Schema tools
for listing, reading, writing and executable/argv/cwd commands. The model transport
never executes them. The runner validates calls, applies account approval policy,
records effects for changes, invokes only the Computer port and appends bounded
tool results to its process-local model history before another turn. A Run allows
eight tool rounds and at most sixteen calls per round; excess fails with
`TOOL_ROUND_LIMIT`. Each complete serialized result is at most 16,384 UTF-16 code
units, includes an untrusted-data label and reports truncation. Commands have a
60-second execution deadline and a combined 32,768-byte capture budget. No implicit
shell or backend-host execution is introduced. No configured provider means no
offered tools; ordinary replies still work.

The first executed tool lazily starts and pins the Space team computer generation.
Approval waits keep the Agent's queue slot, so new messages are accepted and queued
while only one Run can use that Agent's computer. Completed text on each model turn
commits as a reply segment before any tool calls. Tool arguments and results are
not conversation events. Stop resolves pending cards and aborts model access and
in-flight command execution through the Computer cancellation port. Unknown effects
block continuation; there are still no checkpoints, attempts or crash recovery.
See [approvals](approvals.md#implemented-backend-computer-slice).

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
Ambient provider keys are never consulted. A later member-owned Connection
adapter can implement the same port using the Run's Space and member identity.

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
`run.finished` with durations in milliseconds: wait before creation, wait before
the first start, time to the first visible response, and total time. The first
response time is committed with its output and survives resumes. Logs carry no
message content.
