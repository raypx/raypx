# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Web and the MyGo Desktop renderer share the Agents workspace. Mobile is an Expo
iOS/Android client for Space Agents, direct conversations and account access.
Client coverage differs as described below; packaged native acceptance is separate.

## Users

People who want persistent Agents and continuing conversations across signed-in
devices, and teams that share Agents within a Space. A Space is the authorization
boundary. Deployment administrators gain no Space access from their operator role.

## Product Purpose

Raypx gives Agents a continuing identity, instructions, model selection, memory,
routines and a computer. Sign in, select a Space, create or select an Agent and
send a message. The backend continues accepted work independently of an open
client. Context and memory never authorize actions.

## Positioning

PostgreSQL is the authority for Agent state, conversations, Runs, approvals and
effects. Clients express intent and render results. The backend owns execution,
recovery and fresh membership checks. The Agent runtime and model credentials
stay outside computers. A private supervisor alone holds the Docker socket;
external model and tool credentials stay behind backend adapters.

An operator controls the deployment and stored conversation content. Optional
services sit behind ports. A missing model or computer configuration appears as
unavailable rather than fabricated progress. See the
[architecture](docs/architecture/README.md).

## Operating Context

Web and Desktop open `/agents` after sign-in. Spaces, direct Agents and groups
share this workspace; `/pages` opens versioned documents, and `/join` handles
invitations. Account settings include models, approval policy, Skills and Tools.
Space owners manage OpenAPI documents, operation selection, write-only credentials
and all/selected Agent availability beside remote MCP servers in Tools.
Web retains public/legal pages and the separate administration console.

Desktop uses the system browser for sign-in and the existing private daemon
transport. Its Page preview opens Web because authenticated document embedding
is disabled in Desktop. The host targets macOS 13.5+ and Windows; Linux Desktop
acceptance remains unverified. A browser renderer check is not a packaged test.

Mobile provides Agent creation/editing/deletion, Space selection/creation,
direct conversations, streaming, the active-Run strip, approval cards, tool activity,
computer lifecycle and account/sign-out. Page activity opens Web. Full shared-Space/group management,
routine and memory editors, Page editing, API/resource settings and push notifications
are not native Mobile workflows. OTA updates are not configured. iOS/Android
device acceptance remains unverified.

## Capabilities and Constraints

| Area                  | Implemented behavior                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversations         | One continuing direct conversation per Agent; bounded initial/older history, gap loading, streamed text, committed segments, acknowledged replay and snapshots. Web/Desktop include virtual and full-text reading modes.                                  |
| Runs                  | PostgreSQL leases, fenced attempts, checkpoints, steering, explicit stop, worker recovery and graceful handover. Model/connection/resource choices are pinned for resume. Active work stays reachable outside loaded history on all clients.              |
| Computers             | Space team computer lifecycle, bounded file browsing, file/command tools, durable homes and generation checks through the Docker provider and private supervisor. Host egress rules require explicit setup.                                               |
| Approvals and effects | Ask and Never ask, exact Allow/Block rules, addressed expiring requests, conversation cards and durable effect intents/outcomes. Unknown effects block automatic replay. Auto review and protected input are unavailable.                                 |
| Routines              | Cron with time zones, keyed webhooks, authenticated email relay and signed repository events; manual tests, pause/resume, deduplication, coalesced catch-up and linked Run history.                                                                       |
| Memory                | Versioned Agent or shared Space documents, editing/removal/restore, bounded recall pinned into Run checkpoints and permission-checked Agent writes.                                                                                                       |
| Pages                 | Markdown/HTML documents, immutable versions, conflict checks, restore, sandboxed serving and revocable optional version-pinned share links. Agent writes expose Page links in activity.                                                                   |
| Skills and tools      | Account skills and Space-learned text skills, bounded non-executing imports, per-member Agent selection and remote HTTP MCP servers, plus Space-owned selected OpenAPI operations with write-only credentials. Backend command/stdio servers are refused. |
| Models                | Member-owned encrypted model connections with all/selected Space availability, offered model choices and bounded connection testing; deployment models remain available when configured.                                                                  |
| Shared work           | Owner/member management, single-use invitations, approval overrides, audit history, named groups, explicit Agent mentions, concurrent replies and bounded delegated child Runs with inherited authority.                                                  |

Web/Desktop expose routines and Space memory from the conversation header,
Space settings and group controls from the workspace, and Pages from navigation.
Tool lifecycle belongs in activity; approvals stay actionable without disabling
the composer. Delegated work stays under its parent activity. Pending requests,
failures and uncertain outcomes remain explicit.

A bounded Still working strip above the composer shows active Runs whose triggering
messages are outside loaded history, with Agent, state and origin/untrusted
markers. Stop, targeted steering and addressed approvals work without loading that
page. Show Run loads the trigger page; its strip row disappears when the message
is loaded. Truncation is explicit and can be refreshed.

OpenAPI imports are bounded JSON/YAML documents, pasted or fetched once. Calls pin
the registered host through the remote-tool DNS resolver, refuse private ranges
except explicit loopback development endpoints, and refuse redirects. GET/HEAD
are reads; other supported methods are changes under approval and exact Allow/Block
rules. Every call records an effect; bounded responses are untrusted. Credentials
remain encrypted and outside clients, model context, events and logs. Mobile
shows API activity and approvals; management remains in Web/Desktop.

Transient model text is process-local; committed segments and events are durable.
A client connected to another API process may receive the committed turn without
its transient prefix. Recovery uses committed checkpoints and never promises
exactly-once external effects. Credentials, deleted resources or changed access
can prevent resume with an explicit failure.

Computer isolation depends on the Engine and configured host rules. Public HTTPS
and the selected DNS upstream remain available under restricted IPv4 egress;
private/metadata/host destinations and alternate DNS are blocked by that ruleset.
IPv6 enforcement needs separate host acceptance. A device grant is not sandbox
isolation. Hosted computers, graphical takeover and the replacement outbound-only
device connector remain future work. Managed app connectors and web search/fetch
are not implemented Agent capabilities.

Project/session editors, Waiting, guest task handoff and device Automations pages
are removed from Web/Desktop. The CLI/daemon, account/device context APIs, local
schedules, native enrollment and remote projections remain only for retained
consumers until their replacement phase. They do not own new Agent state or
import device history into Spaces.

Conversations require a reachable server and valid account session. Drafts and
uncertain-send receipts stay device-local and scoped by origin, account, Space
and conversation. Restoration never sends; delivery retry preserves its key,
and failed-Run retry restores editing for an explicit new Send. Preferences and
retained CLI profiles survive logout without transferring account/origin identity.

## Brand Commitments

The product name is Raypx. Preserve its original artwork and neutral light/dark
visual system. Public decoration follows the scoped logo palette in `DESIGN.md`;
the workbench stays neutral. Describe only implemented behavior and real outcomes.

## Evidence on Hand

The implementation, deterministic fixtures and tests live in this repository.
PostgreSQL, listener/browser, real Engine, live-model and packaged native results
are independent gates. Tests prove only what actually ran; unverified platforms
stay unverified. There are no customer endorsements or pricing claims to reuse.

## Product Principles

- Organize work around persistent Agents and continuing conversations.
- Check fresh Space membership for every request; context is never permission.
- Keep PostgreSQL authoritative and credentials outside clients and computers.
- Preserve idempotent delivery and checkpoint recovery without replaying unknown effects.
- Show failures, unavailable states and permission boundaries accurately.
- Keep retained device data separate until its owning replacement phase.

## Accessibility & Inclusion

English and Chinese are first-class. Preserve keyboard focus, accessible labels,
reduced motion, touch targets, phone layouts and stable reading positions during
streaming. Native component mocks do not establish device accessibility acceptance.
