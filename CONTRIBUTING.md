# Contributing to Voidmix

Setup and commands are in [README.md](./README.md). The rules you must follow are
in [AGENTS.md](./AGENTS.md) and the `AGENTS.md` of the workspace you are changing
— read the latter before you start; it is capped at 200 lines and names that
workspace's own verification commands.

For the read order, the tie-breakers on ambiguous choices, and how nested
`AGENTS.md` scoping resolves, see
[coding agents](./docs/development/agents.md). It is written for coding agents and
applies equally to people. For where a new file goes, see
[file structure](./docs/development/file-structure.md).

## Before opening a pull request

Run the workspace's narrowest check first — its `AGENTS.md` names it — then
`bun run verify`, which is the whole gate. [Testing and
verification](./docs/development/testing.md) lists what it contains and which
command to reach for when a stage fails.

**Then verify on a clean checkout.** `verify` inspects the working tree, not the
committed tree, so a file you fixed locally but did not commit passes for you and
fails in CI:

```bash
git worktree add /tmp/check HEAD && cd /tmp/check
bun install --frozen-lockfile && bun run verify
```

That step is not ceremony. `canary` carries no branch protection, so CI reports
rather than blocks — nothing stops a merge or a direct push while a job is red.
Until protection exists with the `typescript`, `e2e`, and `desktop` jobs marked
required, the gate is you. Treat a red run as a stop.

## Commits and pull requests

- One concern per commit. Keep a mechanical change — a reformat, a rename, a
  generated-artifact refresh — in its own commit, separate from behaviour.
- Write the message body for someone reading it in a year: what forced the change
  and what was ruled out, not a restatement of the diff.
- Do not add `Co-Authored-By` trailers.
- Never reset, overwrite, or discard someone else's uncommitted work to simplify
  your change, and do not commit unrelated files that happen to be dirty.
- If your change would relax or reverse a stated constraint, record an
  [architecture decision](./docs/architecture/decisions/README.md) in the same
  pull request and reference it from the rule you changed.
