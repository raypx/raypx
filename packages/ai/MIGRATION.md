# Migration Guide: From Direct LLM Calls to @raypx/ai

This guide explains how the AI framework was extracted and how to use it.

## What Changed

### Before

Previously, LLM calls were directly embedded in the RAG package using LangChain's `ChatOpenAI`:

```typescript
// packages/rag/src/chat.ts (old)
import { ChatOpenAI } from "@langchain/openai";

const chatModel = new ChatOpenAI({
  apiKey,
  modelName: defaultModel,
  temperature,
  maxTokens,
  configuration: { baseURL },
});

const response = await chatModel.invoke(messages);
```

### After

Now, LLM calls go through the unified `@raypx/ai` framework:

```typescript
// packages/rag/src/chat.ts (new)
import { AIClient } from "@raypx/ai";

const aiClient = new AIClient({
  provider: llmProvider,
  apiKey,
  apiUrl: baseURL,
  model: defaultModel,
  temperature,
  maxTokens,
});

const response = await aiClient.chat({ messages });
```

## Benefits

1. **Separation of Concerns**: AI logic is now separate from RAG logic
2. **Reusability**: The AI framework can be used by other packages
3. **Maintainability**: Single place to update LLM provider logic
4. **Extensibility**: Easy to add new providers
5. **Consistency**: Unified interface across all providers

## Package Structure

```
packages/
├── ai/                    # New AI framework package
│   ├── src/
│   │   ├── types.ts       # Type definitions
│   │   ├── providers/     # Provider implementations
│   │   │   ├── base.ts
│   │   │   ├── langchain-base.ts
│   │   │   ├── aliyun.ts
│   │   │   ├── openai.ts
│   │   │   └── deepseek.ts
│   │   ├── client.ts      # Unified client
│   │   ├── config.ts      # Configuration management
│   │   └── index.ts       # Exports
│   └── package.json
└── rag/                   # Updated RAG package
    └── src/
        └── chat.ts        # Now uses @raypx/ai
```

## Usage Examples

### Basic Chat Completion

```typescript
import { AIClient } from "@raypx/ai";

const client = new AIClient({
  provider: "aliyun",
  apiKey: "your-api-key",
  model: "qwen3-max",
});

const response = await client.chat({
  messages: [
    { role: "user", content: "Hello!" }
  ],
});

console.log(response.content);
```

### Streaming Chat

```typescript
await client.chatStream(
  { messages: [{ role: "user", content: "Tell me a story" }] },
  (chunk) => {
    if (chunk.type === "chunk") {
      process.stdout.write(chunk.content || "");
    }
  }
);
```

### Using Configuration

```typescript
import { AIClient, getAIConfig } from "@raypx/ai";

const config = await getAIConfig(userId);
const client = new AIClient({
  provider: config.provider || "aliyun",
  apiKey: config.apiKey!,
  model: config.model || "qwen3-max",
});
```

## Adding a New Provider

1. Create provider class in `packages/ai/src/providers/`
2. Extend `LangChainAIProvider`
3. Implement `getBaseURL()` and `getDefaultModel()`
4. Register in `AIClient.createProvider()`
5. Add to `LLMProvider` type

See `ARCHITECTURE.md` for detailed instructions.

## Backward Compatibility

The RAG package maintains backward compatibility:
- Same `ChatOptions` interface
- Same function signatures
- Same response format

Only internal implementation changed.

## Configuration

### Environment Variables

```bash
LLM_PROVIDER=aliyun
LLM_API_KEY=your-key
LLM_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen3-max
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2000
```

### Database Configuration

User-specific configuration is stored in the `ai` namespace in the database.

## Notes

- LangChain retrievers still use `ChatOpenAI` directly (this is acceptable as they require LangChain types)
- The AI framework is provider-agnostic and can be extended
- All providers support streaming and non-streaming modes
- Thinking/reasoning content is automatically extracted for supported models
