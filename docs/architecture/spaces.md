# Spaces, membership and settings

A Space is the authorization boundary. Agents, conversations, memory, routines,
pages and computers live in one Space and never cross to another implicitly.

## Implemented foundation slice

`@raypx/spaces/server` exposes the admission and repository ports;
`/server/postgres` implements account-scoped discovery/bootstrap and Space-scoped
Space/member reads. A first call to the new procedures creates the account's
private Space, even if it has already joined another. An account-row lock and the
unique private-Space marker serialize concurrent first calls. Explicit creation
also adds an owner in the same transaction. The initial name is `Personal`.

`@raypx/agents/server` exposes Agent CRUD and paired direct Conversation ports,
implemented by `/server/postgres`. API
accepts a Space selector, resolves the current session and matching membership
on every request, and passes an opaque scope to the repository. Both Space roles
can manage Agents; deployment roles do not bypass admission. Lists filter before
limiting. Missing membership and missing records both return `NOT_FOUND`.

An Agent's model choice is an opaque `modelId`, without an endpoint, credential or
vendor field. `agents.models` resolves membership and returns only offered
`{ modelId, name, source }` entries, where source is `connection` or `deployment`.
Member-owned models are available only to their owner in the selected Space.
An optional deployment display name defaults to the
opaque identifier; entries without configured credentials are not offered.
Updates replace the configuration and preserve the Conversation.
Agent/Conversation creation is atomic. The shared Agents client provides Space creation/switching,
Agent forms and direct conversations in Web and Desktop. Member messages and their
stream are described in [the conversation guide](events.md#implemented-conversation-slice).
Phase 6's backend membership slice adds the member directory, invitations, owner
settings, audit and claimed Space deletion. The backend also supports group
conversations, Agent messages and child Runs. Web/Desktop expose membership and
group management; Mobile provides native groups, members and invitations, with
the remaining owner settings using Web handoff. See
[client coverage](../../PRODUCT.md#operating-context) for the exact split.

## Spaces

- A new account gets one private Space. Most people need only one.
- A person adds a Space to keep work apart: a client, a side project or personal
  life.
- An Agent talks only to Agents in its own Space, unless a setting on that Agent
  allows cross-Space messages.
- Sharing an Agent copies its configuration. It never copies its computer,
  credentials, files, private memory or history.

## Membership

- Space roles are `owner` and `member`. An owner manages members, invitations and
  Space settings. A Space always has at least one owner.
- Space roles are separate from the deployment roles. A deployment administrator
  cannot read a Space they have not joined.
- An invitation is a single-use link that expires after seven days. The server
  stores only its hash. An owner can cancel open invitations.
- Opening a link shows what sharing means before the person joins. Joining one
  Space grants nothing in the inviter's other Spaces.
- Removing a member ends their access on the next request, closes their event
  subscriptions and revokes the device grants they gave to the Space.

### Backend membership procedures

`spaces.get/rename/delete/leave/members/updateMemberRole/removeMember` resolve fresh
membership from the session on every request. Rename, deletion, role changes and
removal require an owner; a member can leave. The final owner cannot leave, be
removed or be demoted. Deployment administration never substitutes for membership.
The directory returns account name and image as avatar/initials sources, role and
join time. Only an owner receives email fields.

Removal retains a membership tombstone, excluded from admission and execution.
This preserves the composite references of paused routine definitions and computer
creator attribution. It transactionally cancels active Runs and pending approvals,
pauses owned routines, removes their ingress secrets and connection selections,
and returns the paused routines' IDs and shared names for reassignment. Historical
Runs/messages remain. Rejoining restores active membership as `member` with a new
join time; it does not resume routines or restore connection selections.
The tombstone records whether departure was `removed` or `left`. The existing
`space.member.removed` payload adds optional `reason` with those values. This
distinction survives a lost notification and is cleared when the member rejoins.

`spaces.createInvitation/invitations/cancelInvitation/cancelInvitations` are owner
operations. A link contains 32 random bytes encoded as lowercase hex, returned once;
only SHA-256 persists. Open invitations expire exactly seven days after creation.
Listing persists observed expiration. Removing an inviter cancels their open links.
`spaces.previewInvitation/acceptInvitation` require a signed-in account and a token,
not prior membership. Preview returns the Space name, inviter display name and the
shared categories below without joining. Acceptance locks the Space and invitation
and atomically consumes one link for a new member. Concurrent accepts by different
accounts have one winner. A current member's acceptance is idempotent, preserves
their role and consumes nothing, including when retrying a used link. Other callers
receive distinct expired, cancelled and consumed codes. Creation, preview and
acceptance are limited per account/procedure to 10, 30 and 20 calls per minute.

Deletion commits a claim before cleanup and immediately excludes the Space from
admission/discovery. A worker resumes durable, leased stages: cancel Runs, release
computers, remove Space objects, remove rows. Constructors perform no I/O. Each
stage can be retried after a crash; external removal must be idempotent. The last
private Space means the caller's last active, solely occupied owned Space; deletion
cannot remove that final private home. Computer destruction retains committed
homes according to the existing provider port. No current Space domain record owns
an object-storage key. Supervisor
snapshot purge is outside this slice.

## What members share

- Agents, conversations, memory and routines. Every member sees and can change
  them.
- The team computer. Files and installed tools there are visible to every member.
- Pages and their share links.

## What stays each member's own

- Model credentials, connections, MCP servers, skills and approval rules.
- A Run uses the credentials of the member who started it. Its approval requests
  go to that member only.
- A routine runs as its owner. Editing another member's routine makes the editor
  its owner.
- A device grant. A granted device runs only its grantor's Runs.

## Settings and availability

- Models and approval mode are account defaults that every Space follows. A Space
  overrides one only as a deliberate exception.
- Skills, MCP servers and connections belong to the account that added them. Each
  is available in all of that account's Spaces or only in chosen ones.
- "All Spaces" includes Spaces created later.
- What a member adds is available in all their Spaces until they narrow it. What an
  Agent creates, such as a skill, is available only in the Space it was created in,
  because it may carry that Space's details.
- A member never receives another member's items. Availability spans one owner's
  Spaces, never other people.
- The availability choice appears only to someone with more than one Space.

`spaces.settings/setApprovalOverride/clearApprovalOverride` are owner-only. The
nullable Space override supports Ask and Never ask. Auto returns
`REVIEW_MODEL_NOT_CONFIGURED`, as account settings do. Each Run policy resolution
uses the Space override when present, otherwise its actor's account default; exact
Allow/Block rules remain that actor's private rules. Changing an override affects
the next policy resolution, including a running Run. Model defaults stay per
account in this slice.
Members read their own effective mode and its source through
`approvals.effectiveMode({ spaceId })`; this does not grant owner settings access
or expose another member's defaults or rules.

## Deployment administration

- App accounts never administer the server. Signup order, email address and Space
  ownership grant no deployment privilege.
- The deployment `admin` role manages site identity, registration, email delivery,
  object storage and background cleanup, as today. It grants no access to Spaces.
- Operators configure the server through environment variables and deployment
  tooling.

## Audit

- Membership, invitation, device grant, approval and setting changes are audit
  events, including failures and refusals.
- Audit history is append-only and retained indefinitely. Missing audit storage
  blocks these writes.
- An owner reads the audit history of their Space. It never names another member's
  private items.

`spaces.audit` pages newest first by `(createdAt, id)` with a Space-bound opaque
cursor and at most 100 rows. Audit writes append a durable `pending` intent and a
separate `succeeded`, `refused` or `failed` outcome linked by `operationId`; outcomes
never rewrite history. A success commits with the mutation. An audit failure rolls
back the mutation; failures after rollback append safe codes without arguments,
tokens, emails or private item names. A crash can leave a visible pending intent.
Approval answers use the same writer. Audit actor/target IDs are historical
selectors and confer no access; audit rows cascade only with their Space.

`spaces.events` and `/events` Space subscriptions replay ordered
`space.member.joined`, `space.member.removed`, `space.member.role_changed` and
`space.renamed` records. PostgreSQL notifications actively close removed members'
open streams, including conversation-only subscriptions, without waiting for a
delivery or poll. Existing conversation event payloads retain their fields.
WebSocket numeric close codes stay 4003 for lost Space access and 4001 for session
loss. Their stable close reasons are `SPACE_MEMBER_REMOVED`, `SPACE_MEMBER_LEFT`,
`SPACE_DELETING` and `SESSION_ENDED`. The first three are also recovered from
fresh admission during repair polls. A selector with no membership history keeps
the generic refusal, so it cannot reveal whether an unrelated Space exists.

Group participation is a retained same-Space relation. Removing an Agent from a
group cancels its Runs there, including descendants, while preserving message
attribution. Removing a member cancels all Runs they started in groups as well as
direct conversations. Agent deletion retains its historical identity; groups that
would have fewer than two participants are deleted. Cross-Space Agent messaging
is disabled by default and remains unavailable even when its receiving-Agent
setting is enabled.
