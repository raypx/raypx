# Pi AI model calls

`@raypx/ai` uses the catalog-pinned `@earendil-works/pi-ai` 1.5.2 from the
[Pi repository](https://github.com/earendil-works/pi/tree/v1.5.2/packages/ai).

The package provides model catalogs, streaming responses, structured tool-call
data, usage totals, deadlines and cancellation. Default providers are Anthropic,
OpenAI, Google and OpenRouter. Callers can supply Pi `Provider` implementations
or use `createCompatibleProvider` for an Anthropic Messages, OpenAI Completions
or OpenAI Responses endpoint. Provider SDK implementations load lazily.

## CLI

The standalone CLI embeds Bun, the SDK and catalogs. `ai providers` and `ai models`
read local data without enrollment, resolving credentials or contacting a provider.
Completion and managed tasks require initial instance enrollment; subsequent use
is independent of the online Raypx session:

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

## Local Pi automations

In Desktop, open an authorized project, enable Pi, and choose **Automations → New automation**.
Select **Run a Pi session**, enter the instructions, and set the schedule and time zone.
The daemon starts one session per occurrence using the device's configured model. **Run now**
tests the same path, including while the schedule is paused. Open **Run history** to reach the
session and answer its approval requests. Pause affects future automatic runs. Cancel an active
run from its session. Missed occurrences are skipped.

### Webhook and email triggers

Choose **Webhook** or **Email** under **When to run** for a local Pi automation.
You can combine either with Cron or turn off the schedule. **Trigger details** shows
the URL and key for Webhook and the routine's address for Email. The key can be
rotated from that panel. The run history identifies the delivery source.

Enable the receiver in `~/.raypx/config.toml` and restart the daemon. The `profile`
defaults to `default`; use the profile that owns the routines. Choose an unused
loopback port. `public_url` is the HTTPS origin of your reverse proxy. Omit it
for same-machine Webhooks. For remote delivery, proxy the enabled paths
`POST /routines/webhook/*`, `POST /routines/github/*`, or `POST /routines/email`
to the configured loopback port.

```toml
[routine_ingress]
profile = "default"
port = 49321
public_url = "https://routines.example.com"
# Configure both fields below to receive email.
email_domain = "routines.example.com"
email_relay_key = "REPLACE_WITH_A_RANDOM_BASE64URL_SECRET"
```

#### Webhook

Send JSON to the URL in **Trigger details** with `Authorization: Bearer <webhook key>`
and an `Idempotency-Key` of 1–128 letters, digits, underscores, periods, colons,
or hyphens. Use the same key and JSON for each retry of one event. Rotating the
Webhook key immediately invalidates the previous one without changing the URL.

#### Email

Use an inbound mail relay for `email_domain`. Set the routine's **Allowed sender address**
and give the relay its generated recipient address. The relay must authenticate and align
the message's `From` domain before asserting the `from` address. Use trusted results
from the receiving service, such as a DMARC pass from Cloudflare Email Routing's
own authentication header. Preserve the SMTP envelope recipient as `to` and supply
only the parsed `To` and `Cc` addresses as `recipients`. [Cloudflare authentication results](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/#authentication-results)

The relay sends `POST /routines/email` with `Authorization: Bearer <email relay key>`,
`Content-Type: application/json`, and the following fields. Use a stable `messageId`
for each delivery and its retries. The relay credential is separate from the Webhook keys.

```json
{
  "to": "<routine UUID>@routines.example.com",
  "from": "owner@example.com",
  "recipients": ["<routine UUID>@routines.example.com"],
  "messageId": "<report-42@example.com>",
  "subject": "Daily report",
  "text": "The build is green."
}
```

The recipient must appear in To or Cc, and the authenticated sender must match the
configured address. The session receives the sender, subject and plain text. Attachments
and HTML are outside this integration.

Both endpoints return `202` for accepted deliveries and matching retries. Email that
does not match a routine's admission rules returns `202` with `accepted: false`.
Retry `503` with the same delivery ID. This covers a busy routine or unavailable
daemon. `409` signals a reused ID with different data. Oversized bodies return `413`.
The HTTP body limit is 64 KiB, Webhook JSON and email text have a 16,000-character
limit, and the combined session instruction and delivery must fit the 32,000-character
session budget. Delivery receipts persist for at least seven days. An accepted event
can be inspected in run history. If the daemon stops mid-run, it records the
interruption and skips replay. Pause blocks new automatic events and leaves manual
testing available. Pi's usual approvals apply to changes and commands.

For a Cloudflare Email Routing Worker, parse the incoming MIME with `postal-mime`
and forward only authenticated messages. Set `RAYPX_ROUTINE_EMAIL_URL` to the full
HTTPS email endpoint and set `RAYPX_ROUTINE_EMAIL_RELAY_KEY` as a Worker secret.
Use a receiving domain whose mail provider controls who may send from the configured
mailbox. [Cloudflare Email Worker API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/) · [PostalMime Email object](https://postal-mime.postalsys.com/docs/api/email/)

```js
import PostalMime, { addressParser } from "postal-mime";

export default {
  async email(message, env) {
    const auth = message.headers.get("authentication-results") ?? "";
    const results = auth.split(";");
    if (results.shift()?.trim() !== "mx.cloudflare.net") return;
    if (!results.some((result) => /^\s*dmarc=pass(?:\s|$)/i.test(result))) return;
    if (message.rawSize > 1024 * 1024) return;

    const mail = await PostalMime.parse(message.raw);
    const from = mail.headers.filter((header) => header.key === "from");
    const senders = from.length === 1 ? addressParser(from[0].value) : [];
    if (senders.length !== 1 || !senders[0].address || !mail.messageId) return;
    const recipients = [...(mail.to ?? []), ...(mail.cc ?? [])]
      .flatMap((entry) => entry.group ?? [entry])
      .flatMap((entry) => (entry.address ? [entry.address] : []));
    const response = await fetch(env.RAYPX_ROUTINE_EMAIL_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${env.RAYPX_ROUTINE_EMAIL_RELAY_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        from: senders[0].address,
        recipients,
        messageId: mail.messageId,
        subject: mail.subject ?? "",
        text: mail.text ?? "",
      }),
    });
    if (response.status === 413) message.setReject("Routine input too large");
    else if (!response.ok) throw new Error(`Routine receiver HTTP ${response.status}`);
  },
};
```

### GitHub events

Enable **GitHub events** in the routine, enter `owner/repository`, and choose
pushes, issues, or pull requests. Save and copy the GitHub URL and secret from
**Trigger details**. In the repository's **Settings → Webhooks**, add the URL,
select `application/json`, paste the secret, and subscribe to the same events.
GitHub must be able to reach the configured HTTPS origin. If you rotate the
secret, update it in GitHub too. [GitHub webhook setup](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks)

The daemon verifies the signature over the original request bytes before parsing
JSON, and deduplicates by GitHub's delivery ID. Ping and unselected events do
not start a session. Payloads up to 1 MiB are accepted. Pi receives the repository,
event, and push ref and revisions, or the issue/PR number, action, title, link and
a short body excerpt. If a delivery fails while the daemon is unavailable or busy,
redeliver it from GitHub's delivery log. [GitHub webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

### Project file changes

Enable **Project file changes**, enter a path relative to the authorized project,
and choose a check interval from five minutes to one day. Leave the path empty to
check the whole project recursively. File watching replaces the Cron schedule for
that routine. Webhook, email and GitHub triggers can stay enabled.

The first check establishes a baseline. Later checks compare file names, sizes
and timestamps and start one session for a changed snapshot. Pi receives the
configured relative path and whether the target was created, modified or deleted.
The watcher reads metadata only. It skips symbolic links, `.git` and `node_modules`
and checks up to 20,000 entries. If a check fails, the previous baseline is retained.
The baseline survives daemon restart, and resuming a paused watch takes a fresh
baseline. If the routine is busy, changes can be picked up at the next check.

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

`Context`, `Tool`, `ToolCall` and `ToolResultMessage` use Pi's public types.
Tool parameters are plain JSON Schema; CLI converts its Zod schemas with `z.toJSONSchema`.
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

## Injected Agent loop

`@raypx/providers/pi` uses `@earendil-works/pi-agent-core` 1.5.2 for `PiRunner`
and its provider-session adapter. CLI's private `src/runtime/agents/pi/` composes
this adapter for local managed tasks alongside Claude and Codex.
Callers inject the model stream, tools, approval callback and a context store with
atomic revision checks. The runner supplies no filesystem or shell tools.

Each tool passes the injected authorization callback before it starts. Effectful
tools also require a committed execution intent; the CLI owns read-only versus
mutation approval policy.
Tool calls run sequentially; the outcome must be committed before another tool or
model request. An unresolved intent or interrupted running context requires explicit
recovery and is never replayed automatically. Cancellation waits for the active
request/tool and persistence to settle. Model requests have no automatic retries
and a bounded request count. Repeated tool-call IDs are rejected before another
approval or effect, including IDs loaded from an earlier run.

`run(prompt, { signal, timeoutMs })` accepts caller cancellation and a run deadline.
The default is 60 seconds; explicit deadlines range from 1 ms to 10 minutes.
The deadline pauses while waiting for authorization.
A deadline requests cancellation and reports `PI_TIMEOUT` after active work and
durable writes settle. A tool that ignores cancellation still holds the run until
it settles; the runner never starts replacement work while an effect is uncertain.
The first cancellation cause is retained, and a storage failure takes precedence
over a timeout. Once a completed outcome enters its terminal commit, that durable
outcome remains authoritative even if cancellation arrives during the write.

CLI's `src/runtime/agents/harness/context/sqlite.ts` provides
`SqlitePiContextStore(database, contextId)`, borrowing the profile-owned writer.
It separates contexts, validates persisted messages, limits each context to 8 MiB
and commits with an atomic revision check across connections. Callers close the
store after execution has drained; only `ProfileStorage` closes the database.
Reopening preserves completed history and
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
Real model execution and Windows packaging remain separate acceptance gates.

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

## Managed Pi tasks

Desktop and `raypx tasks` run Pi through the existing CLI daemon, using granted
projects and the same `[ai]` TOML/environment configuration. Run `raypx tasks models
--json` to inspect configured models and copy a selection reference. Desktop can
save a profile default, select a model for one Run and reload the catalog after
configuration changes. Credentials stay on the execution device.

An explicit Run selection overrides the profile default, then TOML. Follow-ups
keep the previous model unless changed. A model/connection change never silently
falls back; moving history to another connection needs revision-bound consent.
Switch models between Runs, preserving canonical history.

Plan exposes file inspection only. File mutations and exec-form commands each need
an explicit approval. Unknown tool outcomes block continuation; inspect them and
start a new session. Closing the CLI or Desktop preserves daemon-owned tasks.
Use `tasks cancel` to stop them. The TUI continues to manage Jobs.

[ADR 0041](../architecture/0041-provider-capabilities-and-pi.md) lists the command
tree, JSON examples, durability limits and the local-only scope. Web remote Pi
and mobile controls remain later work.
