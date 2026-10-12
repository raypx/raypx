# ADR-0009: Pi SDK as the VoidMix Agent runtime

## Status

Accepted

## Context

VoidMix needs one Agent execution contract across a local Desktop process and
cloud-visible Project Studio sessions. The product must expose role-aware
streaming events, tool calls, cancellation, and project-local context without
putting model or file-system details in Web UI or API handlers.

## Decision

Embed `@earendil-works/pi-coding-agent` behind `@voidmix/ai`. Pi owns model
sessions, prompt execution, built-in/custom tools, streaming lifecycle, and
abort/steer behavior. VoidMix owns authorization, project/workflow
orchestration, persistence, event projections, device routing, and UI.

Every Pi session receives a unique provider ID and an explicitly authorized
project working directory. Tools default to none; Desktop supplies an explicit
allowlist after the user grants project access. Pi events are normalized to the
VoidMix event vocabulary before persistence or transport. Missing credentials,
models, or local runtime produce an unavailable/failed state and never a fake
success.

## Consequences

- Desktop can use local models and toolchains without exposing them to Web.
- Web can display the same role, step, tool, and output semantics from persisted
  events.
- Provider replacement remains possible behind the `AiProvider` interface.
- Event storage, device authorization, and a real worker/lease loop remain
  required before production 24/7 execution.

## Follow-up

Add the bounded event journal and authenticated device claim/heartbeat path,
then verify cancel, retry, reconnect, offline continuation, and model
configuration against a real Pi provider before enabling live execution by
feature flag.
