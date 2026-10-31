# Pi AI model calls

`@raypx/ai` uses `@earendil-works/pi-ai` 1.4.0, the current package from the
[Pi repository](https://github.com/earendil-works/pi/tree/v1.4.0/packages/ai).
The former package name was `@mariozechner/pi-ai`.

The package provides model catalogs, streaming responses, structured tool-call
data, usage totals, deadlines and cancellation. Default providers are Anthropic,
OpenAI, Google and OpenRouter. Callers can supply Pi `Provider` implementations
or use `createCompatibleProvider` for an Anthropic Messages, OpenAI Completions
or OpenAI Responses endpoint. Provider SDK implementations load lazily.

## CLI

The standalone CLI includes the SDK and catalogs; it does not need Node, a global
Pi installation or a Raypx account. Catalog commands read local data without
resolving credentials or contacting a model provider:

```sh
raypx ai providers --json
raypx ai models '{"provider":"anthropic"}' --json
```

Choose a model from the catalog and configure `~/.raypx/config.toml`:

```toml
# Existing account server settings and profiles can remain in this file.
[ai]
provider = "anthropic"
model = "your-model-id"
max_tokens = 1024
timeout_ms = 60000
# Optional: use this environment variable instead of provider-default credentials.
# api_key_env = "RAYPX_AI_API_KEY"
```

Supply the provider's API key through its environment variables, such as
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or `OPENROUTER_API_KEY`.
`api_key_env` selects a different variable by name. API keys are rejected as TOML
or command JSON fields. `auth = "bearer"` uses the selected key as a Bearer token;
the default uses the provider API-key convention.

```sh
raypx ai complete '{"prompt":"Reply with one sentence about this test."}' --json
```

JSON parameters override non-secret `[ai]` settings. `prompt` is required;
`system` optionally supplies a system prompt. Output is one finite assistant
message with content blocks, stop reason and usage. CLI reads configuration on
each invocation and never rewrites it. `RAYPX_HOME` can select another absolute
configuration directory. Local tool profiles and the selected account-server
profile do not change AI model selection.

## Compatible endpoints

Use explicit protocol and model metadata for a proxy or local inference server:

```toml
[ai]
provider = "my-server"
model = "your-local-model"
api = "openai-completions"
base_url = "http://127.0.0.1:11434/v1"
context_window = 32768
max_tokens = 1024
# api_key_env = "MY_SERVER_API_KEY"
# auth = "bearer"
```

HTTP is supported on loopback. Remote endpoints use HTTPS. URLs cannot contain
credentials, query strings or fragments. If `api_key_env` is omitted for a custom
endpoint, it is keyless and does not borrow credentials from other providers.
Use the API root for Anthropic Messages (the SDK adds `/v1/messages`) and the
OpenAI-compatible API prefix, commonly `/v1`, for Completions and Responses.
Custom models have no catalog pricing: their zero SDK cost fields do not represent
a billing estimate. Usage still reports provider token counts when supplied.

## Library

```ts
import { createAiClient, type Context } from "@raypx/ai";

const client = createAiClient();
const context: Context = {
  messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
};
try {
  const stream = client.stream({ provider: "anthropic", model: "your-model-id" }, context, {
    signal: controller.signal,
    maxTokens: 1024,
    timeoutMs: 60000,
  });
  for await (const event of stream) {
    if (event.type === "text_delta") renderText(event.delta);
    if (event.type === "toolcall_end") requestToolApproval(event.toolCall);
  }
  const response = await stream.result();
} finally {
  client.close();
}
```

`Context`, `Tool`, `ToolCall`, `ToolResultMessage` and `Type` use Pi's public types.
Returned tools are data: the calling feature owns authorization, execution and
adding tool results before another request. The existing task execution host
continues to own its project grants and approval lifecycle.

Requests use SSE and one inference attempt. A caller abort, deadline, early end
of stream iteration or client close cancels active work. `AiError.code` exposes
stable errors such as `AI_AUTH_REQUIRED`, `AI_RATE_LIMITED`, `AI_TIMEOUT` and
`AI_ABORTED`. Provider error bodies and diagnostics are removed from output;
the library never logs credentials, prompts or model content.

## Verification

`packages/ai` tests use Pi's deterministic provider for streaming, structured tools,
failure handling, cancellation and deadlines. CLI tests exercise the actual SDK
against an isolated HTTP/SSE server, including keyless endpoints, explicit keys,
HTTP errors and custom configuration. The copied standalone CLI smoke runs those
model calls outside the repository with an empty PATH. These gates use no paid
inference; a real-provider check must be reported separately.

## Experimental Agent loop

CLI's private `runtime/agents/harness/providers/pi.ts` uses
`@earendil-works/pi-agent-core` 1.4.0 for an experimental `PiRunner`. It is not a
selectable task provider and does not replace the Claude/Codex execution adapters.
Callers inject the model stream, tools, approval callback and a context store with
atomic revision checks. The runner supplies no filesystem or shell tools.

Each tool requires approval and a committed execution intent before it starts.
Tool calls run sequentially; the outcome must be committed before another tool or
model request. An unresolved intent or interrupted running context requires explicit
recovery and is never replayed automatically. Cancellation waits for the active
request/tool and persistence to settle. Model requests have no automatic retries
and a bounded request count. Repeated tool-call IDs are rejected before another
approval or effect, including IDs loaded from an earlier run.

`run(prompt, { signal, timeoutMs })` accepts caller cancellation and a run deadline.
The default is 60 seconds; explicit deadlines range from 1 ms to 10 minutes.
A deadline requests cancellation and reports `PI_TIMEOUT` after active work and
durable writes settle. A tool that ignores cancellation still holds the run until
it settles; the runner never starts replacement work while an effect is uncertain.
The first cancellation cause is retained, and a storage failure takes precedence
over a timeout. Once a completed outcome enters its terminal commit, that durable
outcome remains authoritative even if cancellation arrives during the write.

`harness/context/sqlite.ts` provides the local `SqlitePiContextStore(profileDirectory, contextId)`.
It uses the shared profile database, separates contexts, validates persisted messages, limits each context to 8 MiB
and commits with an atomic revision check across connections. Callers close the
store after execution has drained. Reopening preserves completed history and
unresolved intents; the store does not make recovery decisions.

```sh
bun run --cwd apps/cli smoke:pi
```

This gate compiles the actual SDK loop into a standalone Bun bytecode executable
and runs an approved fixture tool outside the repository, without `node_modules`,
credentials or PATH tools, and with HTTP disabled. It reopens SQLite, continues the
conversation and rejects a repeated tool effect, then reports the executable size.
Unit tests also cover denied approvals, cancellation, deadlines, persistence
failures, context isolation, competing revision writes and uncertain recovery.
Real model execution and Windows packaging remain separate,
unverified gates for this experiment.

## Configuration precedence

`ai providers` and `ai models` never load TOML or resolve credentials. Models use
only the explicit JSON provider filter. Completion JSON overrides TOML within
the same target. Changing provider discards inherited model, endpoint, API,
credential/auth and model limits; changing endpoint discards inherited credentials,
auth and model limits. Explicit JSON fields apply last; timeout and temperature
remain request defaults. Custom endpoints without an explicit key remain keyless.

The standalone smoke compiles the production JS behind an offline fetch harness
and initializes all four provider SDKs. `.artifacts/cli/provider-smoke.json` records provider
coverage and executable/JS sizes; it contains no prompts or credentials.
