# Approvals and effects

An action that changes something follows the owner's approval mode and is recorded
as an effect. This guide covers the modes, the lists and what happens when an
outcome is unknown.

## Modes

| Mode      | Behavior                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask       | Ask before any action that changes something. Reading asks only when the request could carry private data somewhere new.                      |
| Auto      | A review model passes actions that fit what the member asked for. It asks when an action is off-task or irreversible without being asked for. |
| Never ask | Run every action without waiting.                                                                                                             |

- The deployment picks the default mode. The product works with no review model,
  in which case Auto is unavailable.
- An automatic review that errors or is unsure asks. It never passes silently.
- The mode is an account default. A Space overrides it only as a deliberate
  exception.

## Lists

- Allow and Block lists name exact tools or sites. They grow from approval cards
  and from settings, never from guessed categories.
- An allowed action runs without a card in Ask and Auto.
- A blocked action is refused without a card in every mode.

## Untrusted input

Some actions could have been steered by outside text. They still ask in Ask and
Auto:

- a write in a Run started by a webhook or an inbound email;
- an instruction change after untrusted content entered the Run;
- another member's Agent asking to connect.

Never ask runs them, except that it refuses another member's Agent connecting when
outside text could have asked for it.

## Approval requests

- A request names the exact tool, its arguments and the resource version. A
  changed argument needs a new request.
- A request is addressed to one member: the member the Run runs as. Only that
  member can answer it. A second answer is rejected.
- A request never blocks the conversation. The Run moves to `waiting`; new messages
  still start work.
- A request expires. An expired request fails its tool call with an explicit state.
- The answer is an event and an audit event. It resolves on all of that member's
  clients.

## Effects

- Before an action that changes something runs, the owner records an effect intent
  with a key derived from the Run, the tool and the arguments.
- After the action, the owner records the outcome.
- An effect with a recorded outcome is never run again for the same key.
- An effect whose outcome is unknown, such as after a crash mid-call, blocks
  automatic retry. It is shown for inspection. A member decides whether to
  continue.
- Raypx never claims an external effect happened exactly once.

## Protected input

When a tool needs a secret or a sign-in, the Agent asks for protected input. The
member supplies it through a dedicated card. The value goes to the secret store or
directly to the computer for that command. It never enters the conversation, the
model history or a log.

## Implemented backend computer slice

Account settings persist `ask` or `never`; `auto` is explicitly unavailable.
`APPROVAL_DEFAULT_MODE` selects the first persisted account default (`ask` when
unset). A Space owner can set or clear an approval-mode exception; policy resolution
uses that override before the executing member's default. Rules always belong to
the executing member. There are no site rules in this slice. Exact built-in rules
include `computer_list_files`, `computer_read_file`, `computer_write_file`,
`computer_run_command`, `computer_screenshot`, `computer_pointer` and
`computer_keyboard`. A command rule also names its exact executable; it does
not match argv, prefixes or a category. Block takes precedence, including over
Never ask and an Allow added from an older pending request. Lists apply to reads
as well as changes; unlisted list/read calls need no approval. Write and command
calls are changes.

Screenshots are bounded reads but also record effects. Effects and activity retain
only image metadata; the bounded PNG enters private model context with an untrusted
label. Recovery without a committed image result reports its absence rather than
recapturing the effect. Pointer and keyboard calls are changes with the same
Block/Allow, Ask/Never ask, fence and unknown-outcome checks. Member takeover pauses
screen input and commands on screen-capable providers before effect admission,
records `computerInputPaused` on the waiting Run and resumes after release/expiry.

`approvals.settings/updateSettings` use the session account. Their responses add
`revision` and `availableModes`, containing `{ mode, available, reasonCode }` for
Ask, Never ask and Auto. Auto reports `REVIEW_MODEL_NOT_CONFIGURED`; available
modes have a null reason. Updating requires `expectedRevision`. A stale edit
returns `CONFLICT` with `APPROVAL_SETTINGS_CONFLICT` and the current settings in
error data, without changing them. Remembering a new Allow rule from a card also
advances the revision, so it cannot be overwritten by an older settings form.
`approvals.effectiveMode({ spaceId })` is readable by every current member. It
returns `{ spaceId, mode, source, availableModes }` for Runs the caller starts in
that Space. `source` is `space_override` or `account_default`; an account without
saved settings uses `APPROVAL_DEFAULT_MODE`. The same mode availability and reason
codes apply as on account settings. This projection contains no rules, account
default beneath an override, or other member's settings. Space override writes
and `spaces.settings` remain owner-only.
`approvals.pending`
lists at most 100 pending requests addressed to the caller in a selected Space.
`approvals.answer` accepts that Space, a request ID, `approved` or `denied`, and
optional `allowTool`. The latter adds the exact action to Allow without replacing
an existing Block. Settings contain at most 256 exact actions; remembering another
at that limit conflicts with `RULE_LIMIT` and leaves the request pending so it can
be answered without remembering. Every Space procedure resolves fresh membership; another member
cannot answer, and a second answer conflicts. Exact validated arguments stay in
the request record; conversation cards carry only a bounded summary and target.
Targets are workspace-relative paths or command working directories on the selected
Space's team computer. The first Computer operation pins its generation for that
Run; a stale generation fails rather than switching computers.

`APPROVAL_REQUEST_TTL_MS` defaults to 600,000 and is bounded to one day. The live
executor polls requests; pending-list reads and answers also expire due requests.
Expiration resolves the card as `expired` and returns an explicit failed tool
result to the model. A waiting Run retains its Agent's queue slot; a new message
is accepted and queues its own Run. Stop atomically cancels pending requests.
There is no approval or Run recovery scheduler. A request can still be answered
after its executor dies, but answering does not recreate that executor.

Effect keys are SHA-256 over the Run ID, tool-call ID, exact tool name and a
SHA-256 of canonical JSON arguments (object keys sorted, array order preserved).
Intent commits before invoking the Computer port; the bounded result and terminal
outcome commit afterwards. A recorded result is reused for that key. A lost tool
response or an outcome that cannot be committed is also unknown; only a returned
outcome establishes a failed or cancelled change. Every effect read or decision,
including `approvals.effects`, persists intents older than the tool execution
deadline plus margin as `unknown` in the observing transaction, using the service's
injected clock. A young intent blocks with `EFFECT_IN_PROGRESS`; an unknown outcome
blocks with `EFFECT_UNKNOWN`, including a different later change in the same Run.
Member reads lock the conversation counter and current Run without requiring a
live execution lease. Expiry and a tracked tool's single `tool.finished` event with
outcome `unknown` commit together under that Run's current fence. Later reads and
resumed attempts do not append another finish event. Expiry does not require an
attempt, a matching effect fence or lifecycle metadata to classify an intent.
`approvals.effects` exposes up to 512 records for a selected Space/Run. Unknown
effects are never replayed automatically; no exactly-once external effect is claimed.

Protected input is deferred. Known deployment secret values are rejected from
tool arguments before records or Computer calls, and from output before effects
or model history. Tool results carry an untrusted-data label; this label does not
grant authority. Approval decisions remain durable request records and immutable
conversation resolution events and append-only Space audit records. Audit intent
storage is required before an answer; success and the answer commit atomically.
Refused and failed answers are audited with safe codes and no rule contents.

Phase 4 persists inbound provenance on webhook, email and repository Runs.
The approval policy checks Block first, then read-only/Never ask, then untrusted
write policy, then Allow. Consequently an Allow rule cannot bypass Ask for a
change in an inbound Run; the same policy requires Ask for Auto if that mode is
configured in a later slice. Auto itself remains unavailable without a review
model. Saving/updating memory uses the same policy, addressed request, effect and
fence checks as other changes. Memory tool summaries contain no memory text.

Group context from another Agent, Agent-message triggers and different-member
steering persist the same untrusted-input flag. Ask therefore requires a card for
changes even with an exact Allow rule; the policy would do the same in Auto.
Delegation inherits this flag and the originating member. Child requests use the
child Run ID in the same Conversation, and remain answerable only by that member.
Delegating or messaging an Agent provides no additional credentials, approval
mode or access to another member's connections.

Page create/update and skill save are built-in changes; Page read and skill load
are bounded reads. Their approval, effect, lifecycle and execution fences are the
same as other tools. Exact remote names use a separate open validated type;
there are no wildcard or prefix rules. Every remote call records an effect, even
a read. An annotation alone cannot grant read behavior: an exact Allow is also
required. Block precedes both that read allowance and Never ask. A normal remote
change retains untrusted-input precedence over Allow.

OpenAPI tools use the same exact-name rules, addressed cards and effect lifecycle.
GET/HEAD are read-only for approval classification; other supported HTTP methods
are changes. A read can run in Ask without an Allow rule, while an exact Block
still wins. A mutating operation follows Ask/Never ask and untrusted-write rules.
Cards and activity show the registered operation label, method and read/change
classification. Every HTTP call records intent/outcome, including reads, so a
completed result replays without redispatch and an unknown result is never retried
automatically. The configured API credential is absent from the approval arguments,
summaries and effect results.
