# Backend model access

The backend owns model calls, Agent tools, approvals, effects, Run checkpoints
and recovery. `@raypx/ai` provides the model transport consumed by the API model
adapter and Agent stream types. The CLI contains no model configuration or Agent
harness.

Members manage encrypted model connections through Space-authorized services.
Deployment catalogs use `AGENT_MODELS` and protected `AGENT_MODEL_CREDENTIALS`.
Empty configuration permits startup and produces a visible unavailable state.
Secrets remain request-owned and never enter logs, computers or checkpoints.
See [execution](../architecture/execution.md) and
[capabilities](../architecture/capabilities.md) for current model resolution.
