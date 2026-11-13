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
