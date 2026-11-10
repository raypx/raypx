# ADR 0042: Application services and adapters

Status: Accepted, 2026-11-03. Extends ADRs 0040 and 0041.

Current implementation (2026-11-09): MyGo/Go owns the native Desktop host;
the TypeScript CLI/daemon uses embedded stable Bun under
[ADR 0047](0047-bun-cli-production-packaging.md). Application service, port and
composition boundaries remain accepted.

## Direction

Entry adapters call application use cases and queries. Application services depend
on Core domain models and narrow owned ports. Concrete provider, SQLite, OS and
transport adapters implement those ports. Application composition creates resources
and owns shutdown. No DI container or additional workspace is required.

Task command input schemas and TaskContinuation live in Core. Contracts composes
wire messages without domain re-export aliases. Existing HTTP, IPC, relay and SQLite
formats are unchanged; the local piContinuation wire field maps to continuation in
the Tasks page model. AgentTask remains the sole persisted lifecycle. The Run status
projection is current; speculative standalone manifests and transitions are design
work, not executable platform contracts.

## Device

AgentRuntime is the device ingress/composition facade. AgentCommandService owns
command use cases and receipt recovery; AgentQueries owns read projections.
ExecutionCoordinator alone owns active handles, startup cancellation fences,
draining and project-lock release. ManagedExecution owns each run's turn queue,
approval and cancellation state machine.

CLI entries select command, TUI, stdio or daemon ownership through one private
execution-owner factory. Service construction retains lazy Agent ownership and
each mode's scheduling/EOF behavior. The factory adds host services only to daemon
and Windows foreground stdio; entry adapters own signal registration and output.
Desktop consumes the existing IPC contract through an injectable platform port.
Its Go host composes an Engine adapter that owns child-process framing and the
version-matched daemon proxy.

Application services receive persistence ports. AgentStore borrows ProfileStorage's
single SQLite writer. [ADR 0044](0044-event-sourced-cli-orchestration.md) defines
the atomic decision transaction spanning receipts, events, task/request/input/activity
projections, relay journal/outbox and effect intents. Forgetting and replay retain
their atomic operations and serialization.

ProviderRegistry accepts drivers with discovery, scope admission, preparation and
continuation inspection. Process and SDK drivers prepare the same SessionFactory
and disposal contract. CLI composition owns concrete adapters, model access,
Claude's HTTP approval endpoint, Git inspection and OS locks. Memory receives a
project-validation callback rather than an AgentRuntime; validation does not probe
providers or spawn Git.

RemoteControl receives HostAgentPort with explicit operations for commands,
terminal decisions, capability/project projections and replay/snapshot lifecycle.
It has no local method router or provider policy. CLI's driver policy produces
remote projections and independently enforces execution admission. Pi remains local.

## Server and views

Control exposes credentials, projects, commands, tasks and observed service groups.
Its persistence interfaces are separate from PostgreSQL implementations. Project
validation is independent of context resolution, allowing projects, Memory and
commands to be composed in dependency order. API's HTTP shell installs middleware;
RPC feature handlers use an injected shared boundary for authentication, Origin,
limits, deadlines and error mapping. API and Relay execute no local provider.

Tasks/model owns capability-based create/continue rules, frozen submission identity,
context transfer plans, draft data and conversation history. React owns queries,
subscriptions, cancellation, focus and dialogs. Browser draft storage implements
the model's port; editors do not read localStorage directly. Desktop's IPC adapter
normalizes wire continuation metadata. Remote clients retain their current features.

## Enforcement and verification

Tooling's existing policy discovers workspaces from manifests and checks transitive
source imports, including re-exports and dynamic imports. Application code cannot
reach SQLite, OS process/file implementations or concrete providers through a
barrel. Page models cannot reach React, UI or transport implementations. Infrastructure
cannot reach the local runtime composition entry.

Preserve provider conformance, command identity, restart recovery, approval
application-before-effect, effect intent/result ordering and drain tests. Verify
the HTTP authorization/error contract and browser model/interaction regressions.
Build and smoke the standalone CLI, Web and Desktop renderer separately; native
packaging, live providers and signing remain separate acceptance gates.
