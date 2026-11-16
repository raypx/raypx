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

An experimental deployment catalog entry opts into long conversation compression
with `"compactHistory": true`. At 80% of the estimated input budget after the
model transport's safety margin and output allowance, a tool-free
request to the pinned model summarizes the older history. It keeps at least six
recent messages and preserves Run tool history and member attachments. Only a
shorter projection that fits the estimated budget is used. Large prefixes that
cannot fit one summary request fall back to ordinary model handling.

The Run saves the accepted summary before using it. Recovery reuses it from the
same fenced checkpoint. The transcript remains the source, and the next Run
can summarize its own prefix. A summary is untrusted context under existing
approval rules. Member-owned connections do not opt in to this prototype.

A deployment catalog entry can opt into the alternative with `"searchHistory": true`.
Enable at most one history strategy per entry. The runner keeps at least six
recent entries verbatim and offers `agent_search_history` over the older part of
the same authorized Run history. The tool accepts literal keywords and an older
position. It scans at most 256 entries, returns at most four excerpts and accepts
no Space or conversation selector. The existing exact Block rule applies. Results are untrusted and the
pinned split and tool continuation survive recovery. The prototype uses the
existing Run history bounds and does not retrieve attachment bodies.

To compare original history, synchronous summaries and retrieval, point the
synthetic fixture at a loopback OpenAI-compatible chat endpoint with tool calling
and an 8,192-token window. Each case asks three questions across separate Runs
and carries forward that policy's replies. The report includes every model
request, including summaries and replies after lookups. Each answer is scored by
exact match, ignoring case. Timings cover the model adapter and local lookup,
without PostgreSQL or client request time.
Pass `requested` for a second comparison in which all three policies receive
the same explicit request to search older messages when the tool is available.
Pass `guided` to isolate the first tool request in a separate model call with the
subject supplied by the fixture. The report charges that call to the retrieval
arm. This diagnostic measures use of native lookup results independently of
autonomous tool selection. The production policy remains model-driven.

```sh
bun run --cwd apps/api bench:history-context http://127.0.0.1:8081/v1 MODEL_ID [natural|requested|guided]
```
