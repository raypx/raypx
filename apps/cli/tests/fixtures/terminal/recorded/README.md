# Recorded Agent contracts

These fixtures were recorded from synthetic projects, not reconstructed from
documentation. Each file records the provider version, capture time, scenario
and transport. IDs and local paths are replaced; field structure, event order,
null values and numeric usage remain intact.

- Claude Code 2.1.302: real terminal permission allow/deny/native fallback
  and partial stream JSON.
- Codex 0.163.0-alpha.11.2: real terminal permission allow/deny/native fallback,
  plus an app-server message and usage stream.
- Both providers: completed no-decision hooks after approval-client disconnect
  and a configured 60-second expiry, followed by native approval prompts.
- Bash approval is verified. Codex apply_patch/MCP and Claude question/plan
  remain separate live gates; handwritten examples do not establish support.

The hook captures pass through the private Unix socket and persistent
RequestBroker. The Codex harness uses the documented one-invocation hook-trust
automation flag only for its own recorder in a fresh configuration directory.
It does not validate the user's interactive `/hooks` trust flow and does not
change persisted trust. Production installation must retain manual review.

Run the live gates when changing supported CLI versions, before releasing an
adapter, and weekly on an authenticated controlled machine. Default verification
only replays these fixtures and never spends model usage.

Export raw captures with `tests/smoke/export-terminal-recording.ts`, review the
output for private data, then run the recorded-contract tests. Raw captures,
terminal screens and temporary authentication data must stay out of Git.
