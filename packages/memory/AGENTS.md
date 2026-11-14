# Agent and Space memory

/model owns pure editor state and injected ports; /client composes current
SpaceMemoryPanel. /space-server owns scoped service, deterministic bounded recall
and memory change tools; /space-server/postgres owns persistence. Every request
uses current Space membership. Revisions are immutable; removal/restore creates
a new revision and preserves untrusted provenance. Checkpoints pin exact accepted
context and relational revision identities. Recovery never recalls newer text.

Tool writes require Run lease/fence and idempotent Run/tool identity; shared writes
also require Agent configuration. Context never grants permission. Semantic ranking
is an injected port over already filtered candidates, with no installed embedding
service. No account/device library, context picker, snapshot or /server entry
exists. Run check/test and serial test:postgres on a disposable database.
