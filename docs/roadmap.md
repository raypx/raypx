# Pi product roadmap

Pi is the priority for new Agent capabilities. Build the daily local workflow on
Desktop and CLI first. [Product scope](../PRODUCT.md) and the
[current architecture](architecture/README.md) describe the available features.
Release evidence follows the [testing gates](development/testing.md) for each
candidate and platform.

## Current foundation

The independent Bun CLI daemon owns local sessions, processes, approvals,
scheduling and profile SQLite. Desktop is its MyGo/Go client. One-time
account/origin-bound enrollment permits subsequent offline work. Claude, Codex
and device-local Pi use the private CLI harness; `AgentTask` remains the persisted
Run record. Remote opt-in exposes scoped device work through Relay and API read
projections; it does not transfer Agent ownership to the server.

Pi already supports model selection, Plan and Run modes, approved project tools
and continuation from saved context. See [managed Pi tasks](development/ai.md#managed-pi-tasks).

## Local Pi Run review

Desktop and CLI show bounded, read-only Git snapshots before and after a device-local
Pi Run. A single remaining tool approval can survive an owner restart. See
[managed Pi tasks](development/ai.md#managed-pi-tasks) for the user flow and limits.

Exercise the workflow with a synthetic project and a deterministic model fixture.
Collect separate, opt-in live Pi acceptance for packaged Desktop and CLI on
macOS and Windows. Verify model setup, a rejected action, an approved change and
continuation after reconnecting to the daemon.

## After review: Pi recovery and acceptance

Extend failure injection around receipts, approvals, effect intents and
projections. Test duplicate delivery, process loss during a pending decision,
interrupted writes and reconnecting event cursors. Recover committed history.
Keep uncertain external effects inspectable and block their automatic replay.

Exercise long-running Pi work while Desktop is closed, reconnect to the same
daemon, and verify explicit daemon stop drains owned work. Test history and memory
backup and restore separately from process recovery. Follow the
[Agent acceptance guide](development/agent-quality.md) and
[Desktop release guide](development/desktop.md#build-and-release).

## Local Pi automations

Local Cron jobs can start a Pi session with a saved instruction in an authorized
project. They support pause and resume, manual tests, one run per scheduled
occurrence and history links to the session. Webhook, authenticated inbound email,
GitHub repository events and project file changes can trigger the same routine.
The daemon uses the interactive execution and approval path. Missed scheduled
occurrences are skipped.

The rest of the automation phase covers creating a routine from a session,
choosing its model and frozen references, and verifying live delivery and provider
execution. Slack triggers depend on the Slack connection in the messaging phase.

## Named Agents and project artifacts

Give a project multiple named Agents with their own instructions, model,
sessions, memory and automations. Add MCP connections and reusable Skills with
project-scoped permissions. Start with private reports and dashboards that a
routine can update, then add explicit link sharing and revocation.

## Later: explicit server ownership

The longer-term ownership model is in [ADR 0039](architecture/0039-local-server-agent-platform.md).
After the local workflow is proven, support reviewed export/import into one
headless instance of the same CLI runtime with a persistent SQLite profile.
Preview portable configuration, memory and history; exclude secrets and project
content by default. Change ownership only after import succeeds and the user
chooses whether to retain or retire the local copy. Do not silently synchronize
two authorities for the same Agent.

Start with a server-owned project. Pair a Desktop only when that Agent needs a
local project, using scoped, revocable grants and acknowledged cursor recovery.
An unavailable Host must wait or fail explicitly rather than switching workspaces.
The server owns the migrated Run; the paired Host owns only its granted local
execution. These are future capabilities, separate from current remote access.

Extend this phase with browser and desktop viewing and user takeover, private
sandbox computers, and Web and mobile session access. Keep the same execution and
approval semantics across clients.

## Team work and messaging

Add shared spaces with explicit membership, project grants and audit history.
Add group chat, Agent delegation, shared computer access and a ticket board as
consumers of those boundaries. Connect messaging channels and voice once the
shared session and approval flows can be recovered across clients.

## Later: clients and extensibility

- Consider remote Pi access after the local workflow is proven. Require scoped
  Host grants and explicit authorization for remote execution and approvals.
- Extend client parity as supported workflows need it. Mobile currently provides
  the account and login baseline.
- Add MCP/connectors when actual consumers establish a shared tool boundary.
- Import Agent configuration only with preview, explicit selection and executable
  content disabled by default.
- Maintain the existing Claude and Codex integrations. Revisit additional providers
  when a concrete workflow needs one.

Defer Agent teams, a public plugin marketplace, horizontal workers, multi-tenant
Agent storage, object-storage snapshots and container/VM execution until concrete
workflows establish their need. Never treat prompt instructions as authorization
or claim exactly-once external effects. Measure response and recovery behavior
without logging prompts, credentials, private paths or file content.
