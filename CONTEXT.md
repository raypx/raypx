# Raypx context

The accepted [architecture](docs/architecture/README.md) and
[ADR 0066](docs/architecture/0066-server-owned-agent-platform.md) define the target.
The [roadmap](docs/roadmap.md) separates delivered behavior from later work.

- Product: persistent Agents, each with one continuing Conversation. Agents is
  the signed-in home in Web and the Desktop renderer.
- Space: the authorization boundary. Resolve membership on every request and
  scope every repository operation; deployment administration grants no bypass.
- Authority: PostgreSQL holds Agents, conversations, messages, Runs, computers and
  events.
  Clients express intent and render authoritative state. Drafts are device-local,
  keyed by server origin, account, Space and conversation; restoration never sends.
- Phase 1: Space selection/creation, Agent management, one direct Conversation,
  member messages, ordered events, snapshots, acknowledged replay, transient reply
  text, committed segments, queued backend Runs and stop. Model access uses Pi
  and deployment configuration in one API-enabled process.
- Computer slice: members explicitly start/stop a Space's team computer from a
  compact conversation-header panel. State follows `computer.state` and refreshes
  on reconnect; an unconfigured server shows `not-configured` without controls.
  `@raypx/computers` owns lifecycle/persistence; `@raypx/providers` owns the Computer
  port and in-memory/Docker adapters; `infra/sandbox` is the private supervisor.
  Agent tools and approvals are not implemented.
- Later phases: durable Runs, attempts, execution leases, steering and recovery;
  tools, approvals and effects; routines and Agent/Space memory; Pages and
  connections; invitations, groups and delegation; the device connector and full
  Mobile. None is implied by the phase 1 conversation UI.
- Retained screens: account/security, authentication, administration/configuration,
  public Web landing/legal pages, device preferences and standalone earlier Memory.
  That Memory is device/account-owned and is not recalled by phase 1 Agents.
- Removed client surface: project/session pages, New session, Waiting, guest task
  drafts/handoff and dependent Automations. Desktop also removes project Files,
  Terminal, onboarding and old execution settings from the renderer.
- Application: a composition root under `apps/` or `infra/`, never imported by
  another workspace. Library: a private ESM source package with explicit exports.
  Tooling: executables and development/test helpers outside runtime import graphs.
  Discover packages from workspace manifests; do not declare platform metadata.
- Shared feature layers: Core owns schemas and pure rules, Contracts composes wire
  definitions, `/model` owns state and injected ports, `/client` adapts to React,
  `/server` owns use cases and repository ports. API composes adapters and secrets.
- Desktop: the native host launches the absolute bundled CLI for encrypted cookie
  sessions, bounded server events and the outbound connector. Native confirms each
  Space directory grant. No local Agent harness or old profile import remains.
- Backend roles: api, worker, relay and default all. PostgreSQL owns durable Runs;
  split device routing uses a private Redis broker. Combined deployments can omit it.
- Computer boundary: Agent tools use the Computer port; credentials stay outside
  computers. Only the supervisor holds the Engine socket. Device execution retains
  OS permissions and is not sandbox isolation.
- Transition rule: replace earlier code in its owning phase. Add no compatibility
  layer or automatic profile import, and never create a second Agent authority.
  Keep applicable toolchain, UI, i18n and verification rules in AGENTS.md.
