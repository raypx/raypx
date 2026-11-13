# Domain model and data

PostgreSQL is the one authority. Core owns the schemas, identifiers and pure rules
for the records below. Contracts composes wire schemas from them. Feature packages
own their repositories and projections.

## Records

| Record           | Meaning                                                                    | Belongs to       |
| ---------------- | -------------------------------------------------------------------------- | ---------------- |
| Account          | A signed-in person. Better Auth owns users, sessions and passkeys.         | Deployment       |
| Space            | The authorization boundary for everything below.                           | Deployment       |
| Space member     | An account's `owner` or `member` role in one Space.                        | Space            |
| Agent            | A persistent identity: name, instructions, model choice and computer.      | Space            |
| Conversation     | The one continuing thread of an Agent, or a group of Agents.               | Space            |
| Message          | A visible entry in a conversation, from a member, an Agent or a trigger.   | Conversation     |
| Event            | An ordered entry in a conversation's stream.                               | Conversation     |
| Run              | One unit of Agent work.                                                    | Agent            |
| Attempt          | One execution of a Run. A retry or a resume adds an attempt.               | Run              |
| Steering message | Input that arrives while a Run is active and redirects it.                 | Run              |
| Checkpoint       | The canonical model history of a Run after its last committed turn.        | Run              |
| Effect           | The recorded intent and outcome of an action that changes something.       | Run              |
| Approval         | A request addressed to one member, with the exact tool and arguments.      | Run              |
| Computer         | A durable workspace with a provider, a home revision and leases.           | Space            |
| Routine          | A saved prompt with a schedule or an inbound trigger.                      | Agent            |
| Memory document  | Versioned knowledge with `agent` or `space` scope.                         | Space            |
| Connection       | A member's credentialed link to a model endpoint, an app or an MCP server. | Account          |
| Skill            | Reusable know-how an Agent can load. It holds no credentials.              | Account or Space |
| Page             | A document or dashboard an Agent maintains, with versions and share links. | Space            |
| Device           | A registered computer that runs a device connector.                        | Account          |
| Device grant     | Permission for one Space to use selected directories on a device.          | Account, Space   |
| Audit event      | An append-only record of a membership, grant, approval or setting change.  | Space            |

## Space scoping

- Every Space-owned table carries `space_id`.
- A foreign key between two Space-owned tables includes `space_id`. A reference to
  a row in another Space fails in the database.
- A repository takes a Space scope as a required argument and filters on it. There
  is no unscoped read. A list filters by Space before it limits.
- The request boundary resolves the Space scope from the session and the member
  row on every request. Client input never supplies it.
- Account-owned records such as Connections are visible in a Space only through an
  availability row. See [spaces](spaces.md#settings-and-availability).

## Run states

| State       | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `queued`    | Created and due, or waiting for its computer.            |
| `running`   | An attempt holds the execution lease.                    |
| `waiting`   | Paused on an approval, a question or protected input.    |
| `succeeded` | Finished with a result.                                  |
| `failed`    | Ended with an error that will not be retried.            |
| `cancelled` | Stopped by a member, a revoked grant or a deleted owner. |

A Run records its trigger: `message`, `routine`, `webhook`, `email`, `agent` or
`retry`. It also records the member it runs as, its model and connection, and its
computer. These do not change after the first attempt starts.

Phase 1 persists only message-triggered Runs and the five non-waiting states.
It pins model ID and instructions at message acceptance, identifies the initiating
member through a same-Space foreign key, and stores start, first-response and
terminal timestamps plus a stable failure code. Completed reply segments reference
their Run in the same Conversation/Space. Attempts, connections, computers and
recovery fields ship with their writers in later phases.

## Identifiers, time and content

- Identifiers are opaque strings generated by the backend. Clients may supply an
  idempotency key for a message; the backend maps it to one identifier.
- Wire dates are ISO strings. Binary content is base64.
- Message text and attachments are stored once and referenced by events. Large
  objects go to object storage; the row holds a key and a digest.
- Secrets are stored encrypted in the secret store, never in a domain row. See
  [security](security.md#secrets).

## Migrations

- Drizzle owns the schema and the migration ledger in `public`.
- A deploy keeps the previous release running briefly after migrations apply. Every
  migration must work with the previous release's code. Adding a table or column is
  safe.
- A column is dropped in two releases: remove its readers and writers first, then
  drop it in a later migration. A rename adds the new column, backfills it and
  switches the code before the old column is dropped.
- The database is new. It never reads or imports the device profiles or the account
  database of the earlier product.

## Deletion

- Deleting an Agent, a Space or an account claims the record, cancels its Runs,
  releases its computers and then removes rows and stored objects in a background
  job. The claim makes the deletion resumable after a crash.
- A computer's home is retained for a stated period after its owner is deleted,
  then destroyed. The retention period is a deployment setting.
- Audit events outlive the records they describe.

Space deletion now persists `spaces.deletion_claimed_at` and a Space-owned
`space_deletion_jobs` stage/lease/fence. Request admission rejects a claimed Space;
explicit worker startup resumes cancellation, computer release, object removal and
row removal. A committed stage survives worker replacement. Audit intents precede
external cleanup and failure leaves a retryable claim. Computer destruction follows
the existing retained-home provider semantics; Space-owned S3 objects have no
current writers.

Membership removal records `space_members.removed_at`; active queries exclude it.
The retained row keeps same-Space routine/computer references valid. Routine
definitions pause and lose ingress secrets; owner reassignment uses the existing
routine edit path. Audit/invitation metadata retain historical account IDs rather
than granting access through those identities. New membership, invitation,
settings, audit and Space-event records cascade with their Space.

Phase 4 keeps message/Run actor account IDs as historical deployment identities.
Approval requests bind their addressed and answering identities to the Run's
historical actor, with a composite Space/Conversation/Run/account key; they remain
cancelled or resolved when a member/account disappears. Card events retain a
composite foreign key to those requests, including Space, Conversation and Run.
Current membership still gates admission and execution; retaining history grants
no current access. Space/Conversation/Run deletion cascades its owned history.

Routine source IDs reference minimal `routine_identities` tombstones in the same
Space. Deleting an active definition/account removes its secrets and active
records while preserving the tombstone and accepted Run attribution. Removing
membership instead pauses definitions and removes their ingress secrets;
Space deletion removes both. JSON inbound routine IDs have a generated scoped FK
and must equal the Run's source ID. External delivery IDs remain external values.
Memory revision identities in checkpoints live in a relation with composite FKs
to the checkpoint and source revision. Immutable copied context/attribution is
never used as a live resource selector.
