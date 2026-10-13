# ADR-0027: Remove Pi SDK and Simplify AI Architecture

## Status

Proposed

## Context

The current AI execution layer depends on `@earendil-works/pi-ai` and 
`@earendil-works/pi-coding-agent` SDKs. These add complexity:

1. **Heavy abstraction** - The pi SDK wraps model calls, tool execution, 
   session management with its own abstractions
2. **Limited flexibility** - Hard to customize behavior or swap providers
3. **Maintenance burden** - External dependency on proprietary SDK
4. **Complexity** - `@raypx/ai` acts as an adapter between pi SDK and our domain

## Decision

Remove pi SDK dependencies and implement a simplified AI layer that:

1. **Direct model integration** - Use Anthropic SDK (or others) directly
2. **Minimal abstraction** - Only wrap what we actually need
3. **Clear boundaries** - Keep AI concerns in `@raypx/ai`, domain logic in `@raypx/application`

## Implementation Plan

### Phase 1: Create New Simplified Implementation (parallel to existing)

Create new files in `packages/ai/src/`:

```typescript
// agent.ts - Core AI agent interface
export interface AgentOptions {
  model: { provider: string; id: string };
  apiKey?: string;
  baseURL?: string;
}

export interface AgentRunInput {
  cwd: string;
  prompt: string;
  systemPrompt: string;
  tools: readonly Tool[];
  maxOutputTokens: number;
  onEvent: (event: RunEvent) => Promise<void>;
  signal: AbortSignal;
}

export interface Agent {
  run(input: AgentRunInput): Promise<RunEvent>;
}

// anthropic-agent.ts - Anthropic implementation
export function createAnthropicAgent(options: AgentOptions): Agent {
  // Direct Anthropic SDK usage
}

// events.ts - Simplified event types
export type RunEvent = 
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; toolName: string; input: unknown }
  | { type: "tool_result"; toolName: string; output: unknown }
  | { type: "completed"; usage: ModelUsage }
  | { type: "error"; error: string }
  | { type: "cancelled" };
```

### Phase 2: Update Worker to Use New Implementation

1. Replace `CloudPiAgent` with `Agent` in `apps/worker/src/execution.ts`
2. Update tool adapters to match new interface
3. Keep event handlers compatible

### Phase 3: Remove Pi Dependencies

1. Remove `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from `packages/ai/package.json`
2. Delete old files:
   - `packages/ai/src/cloud-pi.ts`
   - `packages/ai/src/pi-events.ts`
   - `packages/ai/src/gateway-pi.integration.test.ts`
3. Update `packages/ai/src/index.ts` exports

### Phase 4: Update API Gateway

1. Simplify `apps/api/server/api/execution-gateway.ts` model gateway
2. Remove pi-specific transport layer
3. Keep hooks interface for usage tracking

## Consequences

### Positive

- **Simpler codebase** - Remove 2 external dependencies and adapter layer
- **Direct control** - Customize model calls, retries, streaming as needed
- **Easier testing** - Mock at a higher level, clearer test boundaries
- **Better types** - No more adapting between pi types and our domain types
- **Easier to extend** - Add new providers (OpenAI, etc.) without SDK constraints

### Negative

- **Loss of pi features** - Session management, resource loading, settings
  - Mitigation: We weren't using most of these features anyway
- **Migration effort** - ~3-5 days to implement and test
  - Mitigation: Parallel implementation keeps existing code working
- **Maintain model integration** - We own the integration code
  - Mitigation: Anthropic SDK is stable, well-documented

## Alternatives Considered

### Keep Pi SDK

- Pro: No migration work
- Con: Continued complexity, limited flexibility

### Use LangChain or Similar

- Pro: Multi-provider support, many features
- Con: Another heavy abstraction layer, overkill for our needs

### Build Provider-Agnostic Layer

- Pro: Easy to add providers
- Con: Over-engineering before we need multiple providers

## Implementation Status

- [ ] Phase 1: New simplified implementation
- [ ] Phase 2: Update worker
- [ ] Phase 3: Remove pi dependencies
- [ ] Phase 4: Update API gateway
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Documentation updated

