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
`{ modelId, name }` pairs. An optional deployment display name defaults to the
opaque identifier; entries without configured credentials are not offered.
Updates replace the configuration and preserve the Conversation.
Agent/Conversation creation is atomic. Deletion removes both synchronously while
they have no execution or external resources; resumable deletion precedes those
future dependencies. The shared Agents client provides Space creation/switching,
Agent forms and direct conversations in Web and Desktop. Member mutation remains
outside these slices. Member messages and their stream are described in
[the implemented conversation slice](events.md#implemented-conversation-slice). Invitations, membership management and their audit
workflow remain Phase 6 work.

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
