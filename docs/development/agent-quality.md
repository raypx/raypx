# Agent quality and performance checks

`bun run perf:tasks` runs the CLI snapshot and Tasks conversation performance
regressions through the existing VP task graph. The gates assert bounded work,
snapshot budgets, stable references and rendered row counts. Timings and memory
measurements are evidence, not hardware-dependent pass thresholds. Browser
acceptance remains a separate Playwright gate.

## Deterministic lifecycle tests

Client and Host accept the same optional `RelayScheduler` for time, jitter and
timers. Manual-clock/socket tests cover exact backoff, renewal, heartbeat, ACK
deadlines and drains; actual loopback integration tests continue to verify the
transport. Renewal failure paths repeat 100 times each without wall-clock sleeps
or test retries.

CLI's `tests/helpers/provider-replay.ts` validates synthetic NDJSON under
`tests/fixtures/agents/replay/`. Direction and protocol fields distinguish requests,
responses, notifications and process exits. Explicit gates pause and release
events; draining waits for queued and in-flight work. Tests inject only a private
execution driver factory and provider process port. Codex and Claude share the
same execution lifecycle scenarios, with separate steer/interrupt assertions.
These fixtures contain synthetic protocol data, not unreviewed private recordings.

## Policy Evals

`bun run eval:agents --provider <provider> --model <model>` previews six synthetic,
policy-derived cases. It imports the real `initialExecutionPrompt`, including
selected-context boundaries; it does not duplicate the production prompt. These
cases measure prompt behavior through `@raypx/ai`, rather than the external Codex
or Claude subprocess lifecycle (covered by protocol replay tests).

The model sees only synthetic files and three tools: in-memory read/write and
simulated Git. No model tool executes a shell, accesses a real project or changes
a repository. Graders inspect attempted effects, final files and committed file
snapshots. They require positive work as well as checking forbidden writes,
commits and pushes; selected reference data includes an adversarial instruction.
Case metadata records policy provenance, not an invented production incident.

Preview is the default and makes no provider request. Actual usage requires
`--run` and provider credentials through the existing AI environment variables:

```sh
bun run eval:agents --provider <provider> --model <model> --case positive-edit --samples 3 --out .artifacts/evals/results.jsonl --run
```

Provider and model are always explicit. Runs are sequential, default to three
samples per case, and stop each conversation after 16 model steps. Use
`--max-steps 1..64`, `--samples 1..100` and a comma-separated `--case` selection
to adjust those bounds. `--out` appends JSONL; use a fresh path for each run.
Result rows contain case provenance, provider/model, prompt-and-tools SHA-256,
grade violations, safe action metadata, elapsed time, token usage and the cost
reported by the SDK. Raw model responses and provider errors are not recorded.
Infrastructure errors have `status: "error"`, distinct from behavioral `fail`.
Any error or failed case exits nonzero.

`--baseline <previous-results.jsonl>` accepts result rows from the same provider,
model and step limit, and reports previous pass/sample counts per case. Prompt hashes remain
in the records so prompt changes can be compared deliberately. Do not infer a
statistical improvement from a single sample or compare different models as a
prompt regression.

CI runs case validators, simulator/grader regressions and an injected model-turn
test without credentials. It never runs paid inference. Actual model results
must be collected explicitly; a passing offline suite is not model-quality evidence.
