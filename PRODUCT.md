# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Web and the Desktop renderer share the Agents workspace. Web serves desktop and
phone browsers. Desktop uses the MyGo host and the bundled Bun CLI/daemon; reducing
that daemon to a device connector is later roadmap work. Mobile currently provides
an account and sign-in baseline.

## Users

People who want a persistent Agent with one continuing conversation, available
from every signed-in device. A Space keeps work apart and is the authorization
boundary. Phase 1 serves an account's private Space and additional Spaces it
creates; invitations, membership management and shared group conversations come
later. Existing developer-oriented CLI tools remain during the transition.

## Product Purpose

Raypx is the home for persistent Agents. The target Agent has an identity,
instructions, a model choice, memory, routines and a computer, and can keep working
while the person is away. Phase 1 delivers the conversation: sign in, open Agents,
choose a Space, create or select an Agent, send a message and follow its streamed
reply in the same conversation on Web or Desktop. Opening a page or restoring a
draft never sends a message.

## Positioning

PostgreSQL is the one authority for Agents, conversations, Runs and events. Clients
express intent and render the backend's state. Pi runs inside the backend for
phase 1 replies; it uses deployment-configured models and credentials. The target
keeps the Agent runtime and credentials outside computers and uses provider-neutral
ports for optional services. The Computer port and providers live in
`@raypx/providers`; `@raypx/computers` owns Space-scoped lifecycle and persistence,
and `infra/sandbox` owns the private Docker supervisor. See the
[architecture](docs/architecture/README.md) and [roadmap](docs/roadmap.md).

Conversation content is stored on the server. A self-hosted deployment keeps that
content under the operator's control. The earlier device-owned runtime remains in
the repository, but does not own the new conversations and is not an offline mode
for them. No earlier profile data is imported.

## Operating Context

Signed-in Web and Desktop open `/agents` by default, retaining validated return
destinations for account and administration flows. Web keeps the public landing and
legal pages. Account and security settings, deployment administration and the
configuration center remain available. Theme and English/Chinese language choices
are device preferences.

Desktop targets macOS 13.5+ and Windows through WKWebView or WebView2. Linux Desktop
acceptance remains unverified. The existing native host still launches the bundled
CLI and handles native session/enrollment boundaries; phase 1 does not replace it.
Browser renderer checks establish no packaged native-platform result.

## Capabilities and Constraints

Phase 1 provides Space creation/selection, Agent management with one direct
Conversation per Agent, member messages, ordered conversation events, snapshots,
acknowledged reconnect/replay, streamed reply text, committed reply segments,
queued Runs and explicit stop. Models come from the backend's offered catalog;
an unavailable model or missing configuration is an explicit state.

Replies execute in one API-enabled process. Runs have no tools, attempts, execution
leases, fencing, steering, automatic retries or crash recovery. A second message
queues another Run. Closing a client does not own or cancel a backend reply, but
a backend crash can leave work unfinished. Durable execution is phase 2, not a
phase 1 claim.

The initial Computer slice lets members start and stop their Space's team computer
from the Agent interface. A compact header indicator opens its state and controls;
stop requires confirmation. State follows backend events and refreshes on reconnect.
A server without a configured provider shows an explicit unavailable state with
no controls. Computer lifecycle leases do not make Runs durable, and no Agent tool
or approval workflow uses the computer yet.

Agent tools, approvals/effects, routines, Agent/Space memory, maintained
Pages, model/app connections, MCP, skills, invitations, group conversations,
delegation, the device connector and full Mobile workflows are later phases.
Their target designs do not make them available in the current Agents workspace.
Retained Memory screens manage the earlier device/account-owned records; they are
not Agent or Space memory and are not recalled by phase 1 replies. Automations
screens that linked to removed sessions are removed rather than left broken.

Project/session pages, New session, Waiting, the guest task editor and guest draft
handoff are removed from Web and the Desktop renderer. Desktop's project Files,
Terminal, onboarding and old execution settings are also removed from the renderer.
The CLI/daemon, local SQLite stores, native Go functionality, device projection
APIs and related server contracts remain pending their owning replacement phases.
Development guides still describe that retained code.

Accounts retain password sign-in, verification/reset, passkeys, email codes,
optional Google/GitHub providers, provider linking and authenticator security.
Desktop signs in through the system browser. Administrators retain site identity,
registration, email, object storage, cleanup, account roles and audited management.
A deployment administrator role grants no Space access without membership.

Guests can browse public pages and change device preferences. Conversations require
a reachable server and an online account session. Unsent drafts and unconfirmed
send receipts stay on the device, isolated by server origin, account, Space and
conversation. Restoring text or retrying a failed Run only restores editing state;
a new Send is explicit. Preferences and retained CLI profiles survive logout.
Another account or server origin cannot take over an existing device profile.

Bun and TypeScript own the CLI, application features and contracts. MyGo uses Go
1.27.3; packaged Desktop users do not install Bun. Deterministic tests run offline;
live model, PostgreSQL, browser and packaged native acceptance are separate gates.
Never claim an unrun platform passed.

Billing/seats, SCIM/enterprise SSO, a public plugin marketplace, messaging channels,
voice and a visual workflow builder are not planned. Additional providers and
other capabilities require a concrete workflow and decision.

Show real execution, permission failures and retry state. Never fabricate data.

## Brand Commitments

The product name is Raypx. Keep the original brand mark and the neutral light and
dark visual system. Public-page decoration may use the scoped logo palette in
DESIGN.md; the workbench stays neutral.

## Evidence on Hand

The Web and Desktop implementations, their copy and the original logo are in this
repository. Tests and fixtures are evidence only for the checks actually run.
There are no testimonials, case studies, press mentions or pricing claims to reuse.
Do not invent them or present illustrative content as real customer activity.

## Product Principles

- Organize the signed-in product around Agents and their one continuing conversation.
- Treat a Space as the authorization boundary. Context is never permission;
  resources never cross Spaces implicitly.
- Keep PostgreSQL as the one authority. Clients express intent; the backend owns
  authorization, validation and execution. Label later capabilities as future work.
- Keep the Agent runtime and credentials outside computers. A granted device has
  the user's OS permissions and is not sandbox isolation.
- Keep drafts scoped to server origin, account, Space and conversation. Restoration
  never starts work, and an uncertain send retains its idempotency identity.
- Show real execution, failures and retry state. Never fabricate data or imply
  exactly-once external effects.
- Preserve the retained device runtime's security boundaries until its replacement
  phase. Do not upload or import its history automatically.
- Add a shared package only when an established responsibility and consumer need it.

## Accessibility & Inclusion

English and Chinese are both first-class. Keep phone browsers, long copy in either
language, keyboard navigation, visible focus, accessible labels, touch targets and
reduced motion usable in the shared Web/Desktop interface.
