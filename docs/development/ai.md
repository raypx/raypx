# Model transport and Agent execution

`@raypx/ai` wraps the catalog-pinned Pi model transport. It supplies catalogs,
streaming, structured tool-call data, usage, deadlines and cancellation. It never
executes returned tools. Feature services own authorization, approvals, effects
and durable context; vendor SDKs stay inside adapters.

## Backend models

New Agent replies run in the backend, independently of the retained local CLI
harness. Members can add encrypted model connections in account Models settings,
select all/selected Space availability and choose an offered model for an Agent.
Credentials are input-only and stored behind API's secret store. Another member
cannot use the connection merely because they share the Agent.

Deployments can also set protected runtime JSON:

- `AGENT_MODELS`: entries with `modelId`, `provider`, `model` and `credentialId`.
  Provider/model selectors must exist in the default catalog; `modelId` is the
  opaque choice exposed to clients.
- `AGENT_MODEL_CREDENTIALS`: maps each credential ID to its secret. Do not use
  build arguments, client variables or Agent records for credentials.

Empty defaults permit startup without model offers. Invalid configuration fails
startup safely; a missing model/connection fails the Run explicitly. Deployment
selection never consults ambient provider keys. See
[deployment model configuration](../architecture/execution.md#deployment-model-configuration).
API and workers share `APP_KEY` to decrypt member connections.

A Run pins its initiating member's model/connection, Computer generation and
resource metadata. Credentials may rotate without changing identity; a removed or
remapped connection prevents recovery. PostgreSQL leases, fences, attempts and
turn checkpoints own execution. Model stream text is transient; committed reply
segments and events are durable. Steering is applied at model boundaries. Workers
recover from accepted checkpoints rather than restarting arbitrary tool effects.

Computer, memory, Page, skill, remote MCP, OpenAPI, messaging and delegation tools
use the backend approval/effect path. Completed effects reuse their stored result; unknown
outcomes block automatic replay. Never infer permission from model output or
recalled text. Delegation inherits the initiating member's authority.

Space-owned OpenAPI catalogs contain only selected normalized operations and safe
labels. Their credentials stay in API's encrypted store and are injected only by
the HTTP adapter. GET/HEAD use read approval policy; other methods use change
policy, and all dispatches record effects. Recovery rechecks membership, Agent
availability and the frozen definition fingerprint before using the DNS-pinned
registered endpoint. See [Space HTTP APIs](../architecture/capabilities.md#space-http-apis).

## Library boundary

The root entry exports the AI client, provider factories, Pi message/tool types,
request-context preparation and stable `AiError` codes. `/config` owns pure
configuration parsing/merging. Compatible endpoints require explicit protocol and
model metadata; HTTP is loopback-only, remote endpoints use HTTPS, and URLs cannot
contain credentials. Custom catalog pricing is unknown; zero cost fields are not
a billing estimate.

Requests use SSE and one transport attempt. The caller owns retry policy. Abort,
deadline, abandoned stream iteration or client close cancels work. Errors expose
stable codes and an optional parsed retry time, never raw provider bodies,
credentials, prompts or diagnostic content. Tool parameters are JSON Schema;
consumers construct schemas and interpret tool-call data.

`@raypx/providers/pi` supplies an injected bounded loop for the retained CLI
harness. It is separate from the server ConversationRunner's durable Run state.
The caller supplies tools, approval and atomic context persistence. Persist intent
before an effect and its outcome before another model request. Cancellation drains
active tools; uncertain effects are never replayed. The adapter owns no filesystem
or shell tools by default.

## Retained device CLI

The following commands still exist for enrolled local profiles until their
replacement phase. They do not configure the server Agent's model connection.
Catalog listing is offline and needs no enrollment or credentials:

```sh
raypx ai providers --json
raypx ai models --json
```

Completion uses the selected device's `[ai]` settings in `~/.raypx/config.toml`
and a provider key from its environment. `api_key_env` names an alternate variable;
keys are refused in TOML and command JSON. `RAYPX_HOME` chooses an absolute
configuration directory. JSON request settings override non-secret TOML defaults.

```toml
[ai]
provider = "<catalog-provider>"
model = "<catalog-model-id>"
max_tokens = 1024
timeout_ms = 60000
# api_key_env = "RAYPX_AI_API_KEY"
```

```sh
raypx ai complete '{"prompt":"Reply with one sentence."}' --json
raypx tasks models --json
```

Changing provider or endpoint discards inherited model/credential settings as
specified by the pure configuration parser. Keyless custom endpoints never borrow
another provider's credential. Local model selection remains profile-scoped.

### Local Pi automations

Retained `raypx jobs` supports local managed Pi sessions in authorized projects.
`jobs run` returns before the session completes; `jobs history` links its session,
`tasks get` reads results and `tasks approvals list` reads pending requests.
Device timers skip missed/interrupted occurrences. They are different from server
routines, which coalesce catch-up in PostgreSQL. The old Desktop Automations and
project/session screens are removed; these commands do not imply a current UI.

### Webhook and email triggers

The retained daemon receiver uses `[routine_ingress]` in device TOML with a
profile, loopback port and optional public HTTPS origin. Email additionally needs
an email domain and independent relay key. It handles device webhook/email and
repository/file-change triggers for local jobs; it is not the backend's
`/routines/:id/*` ingress. Use the CLI's actual schemas/help when maintaining this
runtime. Do not proxy an old device receiver as the server Agent routine service.

## Verification

```sh
bun run --cwd packages/ai check
bun run --cwd packages/ai test
bun run test --package @raypx/agents
bun run verify
```

Transport tests inject deterministic streams and isolated HTTP/SSE fixtures. Agent
suites cover checkpointing and bounded tool behavior; PostgreSQL and loopback
acceptance remain explicit gates. CLI `smoke:pi` and provider smoke validate the
prepared standalone payload separately, outside the repository with isolated
network/PATH. Real inference is opt-in and must name the model and platform; an
offline test is not model-quality or packaged-platform evidence.
