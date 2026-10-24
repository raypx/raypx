# @raypx/ai

## Purpose

Pi AI model transport for Node and the bundled Bun CLI.

## Interface

The root exports createAiClient, provider factories, Pi context/tool types and
stable AiError codes. The actual consumer is CLI's explicit ai command group.
Default providers are Anthropic, OpenAI, Google and OpenRouter; callers may supply
their own Pi providers or createCompatibleProvider for a selected endpoint.

## Constraints

Resolve credentials only for requests. Listing models/providers is offline and
must not read secrets. Credentials, raw provider failures and diagnostics never
enter output or logs. Keep provider SDK imports lazy; do not import Pi's all-provider
or compat entrypoints into the standalone binary. Do not execute returned tools.
Use one request attempt, SSE, a bounded deadline and caller cancellation. Closing
or abandoning a stream aborts its request. Keep settings/filesystem ownership in CLI.
Custom HTTP endpoints are loopback-only; HTTPS endpoints must not contain credentials.
Custom endpoints have unknown prices; zero SDK cost fields are not billing estimates.

## Verification

Run bun run --cwd packages/ai check and test.
