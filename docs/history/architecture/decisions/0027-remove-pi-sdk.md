# ADR-0027: Remove the AI package and provider execution

## Status

Accepted

Supersedes the cloud provider and Pi execution provisions of
[ADR-0016](0016-cloud-agent-platform.md),
[ADR-0017](0017-gateway-and-task-rounds.md),
[ADR-0023](0023-worker-vite-nitro-artifact.md) and
[ADR-0025](0025-worker-single-entry-execution.md). Their Cloud data, authorization,
process isolation, artifact and deadline decisions remain in force.

## Context

The AI workspace and its Pi SDK implementation have been removed. Remaining
workspace imports, API dispatch and Worker execution code still depend on that
missing adapter. Keeping those references makes installation, type checks and
runtime behavior inconsistent with the repository's actual workspace set.
The earlier proposed direct-provider migration has not been implemented and
there is no replacement model or public research adapter.

## Decision

Remove the AI workspace from dependency manifests, lockfile, architecture rules
and current workspace documentation. Remove unused provider SDK dependencies,
tracing entries, provider-only test commands and configuration. Do not create
another adapter or add a provider as part of this removal.

The private execution Gateway retains its grant-authenticated bootstrap,
execution lifecycle and private object operations. Bootstrap reports no model;
model readiness is false. Model and public research requests return
`SERVICE_UNAVAILABLE`, including requests made with a valid RunGrant. Provider
configuration cannot enable these operations. Cloud capability reporting keeps
new Search and Computer admissions unavailable.

Worker still polls durable queued Runs, atomically claims them, renews leases
and launches an isolated Runner from its single Bun executable. Without a model
adapter, an existing claimed Run settles as fenced `failed/MODEL_UNAVAILABLE`
after current control and cancellation checks. Host ownership, epoch fencing,
RunGrants, deadlines, cancellation, scratch cleanup and shutdown remain active.
The Worker retains document extraction, computation and generation helpers for
independent verification; they do not imply live model execution or automatic
delivery. Research tools require an explicitly injected research implementation.

Preserve stored conversations, Tasks, Runs, events, usage, immutable file metadata
and review history. Preserve current account and project authorization, private
object byte/checksum validation, and contracts used to access these records.
Do not drop schema, rewrite historical migrations, restore retired notifications
or outbox dispatch, or expose credentials to Runner processes.

Keep Worker artifact checks independent of providers. The relocated executable
must support `--check` and its same-entry `--runner --check` child, verify real
PDF/XLSX output, and retain Chinese document/converter coverage through
`--check-documents`. Pi and retired task-mail checks are removed. Auth verification,
password reset and welcome mail remain API-owned.

## Consequences

- Bun resolves only existing workspaces and provider-free dependency artifacts.
- API and Worker report explicit unavailable/failed results rather than importing
  missing modules or claiming successful execution.
- Saved Cloud content and security boundaries remain usable without a model
  adapter or a database migration.
- Search answers, live Agent streaming, delegation and automatic document
  delivery remain unavailable. Document helper checks still verify their formats,
  package assets and converters independently.

## Follow-up

A future accepted design must define a replacement execution adapter, trusted
research access, event handling, metered model dispatch and cancellation before
live Search or Computer is enabled. Verify those behaviors against real providers
and the final isolated deployment artifact; configuration alone cannot restore
execution.
