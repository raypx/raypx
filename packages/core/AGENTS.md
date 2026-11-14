# @raypx/core

`/agents` includes named groups, participant/default-responder inputs and an
off-by-default cross-Space-message setting. `/conversation` includes structural
mentions, Agent authors, the `agent` trigger, parent-Run attribution and bounded
Agent-message refusal codes. Existing Run states and failures remain unchanged.

## Purpose

Platform-neutral domain schemas and pure rules shared by current services,
contracts and clients. Public entries cover Spaces, Agents, conversations, Runs,
approvals, computers, routines, memory, Pages, tools, model connections, account
and permissions. /task-text retains shared UTF-16/JSON text normalization; it is
not a task runtime. Routine calendar calculations remain pure and timer-free.

No dependency on contracts, transports, environment, filesystem, frameworks,
storage or auth implementation. Secrets and execution authority never enter public
domain records. Keep same-Space identifiers, bounded schemas and inferred types.
Wire envelopes/cursors/protocol versions belong to Contracts. No tasks, activity,
agent-runs, local/cloud jobs or account-memory public entries remain. Run check/test
and contract consumer tests.
