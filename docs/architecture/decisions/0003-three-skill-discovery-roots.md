# ADR-0003: Three skill discovery roots

## Status

Accepted

## Context

Agent skills need to be discoverable by more than one agent. Claude Code reads
`.claude/skills/`; Codex, Gemini CLI, GitHub Copilot, and others read `skills/`.
The Skills CLI writes the canonical copy of a vendored skill to
`.agents/skills/<name>` and symlinks it into both discovery roots.

That produces three directories and, at six skills, eleven symlinks:

```text
.agents/skills/<name>/   vendored upstream bytes, one real copy
skills/<name>            symlink, except voidmix-infra which is the real copy
.claude/skills/<name>    symlink
```

The obvious simplification is to keep only `.claude/skills/` with real
directories: one root, no symlinks. The repository is small and this layout is
visibly more machinery than the six skills seem to warrant.

## Decision

Keep all three roots and the symlinks.

Collapsing to `.claude/skills/` would make skills undiscoverable by Codex, which
this repository supports as a first-class agent — `CLAUDE.md` exists purely so
both agents read the same `AGENTS.md`, and abandoning that symmetry for skills
while preserving it for instructions would be incoherent.

It would also fight the Skills CLI. `bun run skills:update` writes to
`.agents/skills/` and recreates the symlinks; a hand-maintained single root would
be silently reverted on the next update, or would require dropping the CLI and
its lockfile hashes.

Self-authored skills stay in `skills/` as real directories, so an upstream refresh
of `.agents/` can never touch them.

## Consequences

- Eleven symlinks are committed with mode `120000`. Every skill still has exactly
  one real copy, so there is no content to keep in sync.
- `bun run policy` verifies each link's **literal** target text, not just that it
  resolves. An absolute or over-deep relative link works for whoever created it
  and breaks in every clone; resolution alone would not catch that.
- `.prettierignore` must exclude `.agents/` so the formatter cannot rewrite
  upstream bytes and invalidate a lockfile hash.
- The cost is understood and accepted: this is the largest amount of structure in
  the repository relative to the content it serves.

## Follow-up

Revisit if Codex support is dropped, or if the Skills CLI stops being the
installation mechanism. Adding a fourth discovery root for another agent is not a
reason to revisit — it is the layout working as intended.
