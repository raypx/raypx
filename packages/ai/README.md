# @raypx/ai

Unified AI/LLM framework for Raypx. Provides a clean abstraction layer for interacting with different LLM providers.

## Features

- 🎯 **Unified Interface**: Single API for all LLM providers
- 🔌 **Extensible**: Easy to add new providers
- 🌊 **Streaming Support**: Built-in streaming chat completion
- ⚙️ **Configurable**: User-specific or environment-based configuration
- 🧠 **Thinking Support**: Extract reasoning/thinking content from models like o1, o3

## Supported Providers

- **Aliyun** (Alibaba Cloud DashScope / 通义千问)
- **OpenAI**
- **DeepSeek**

## Installation

```bash
pnpm add @raypx/ai
```

## Usage

### Basic Usage

```typescript
import { AIClient } from "@raypx/ai";

// Create a client with provider configuration
const client = new AIClient({
  provider: "aliyun",
  apiKey: "your-api-key",
  model: "qwen3-max",
  temperature: 0.7,
  maxTokens: 2000,
});

// Generate a chat completion
const response = await client.chat({
  messages: [
    { role: "user", content: "What is the capital of France?" }
  ],
});

console.log(response.content); // "The capital of France is Paris."
```

### Streaming

```typescript
import { AIClient } from "@raypx/ai";

const client = new AIClient({
  provider: "openai",
  apiKey: "your-api-key",
  model: "gpt-4",
});

// Stream chat completion
await client.chatStream(
  {
    messages: [
      { role: "user", content: "Tell me a story" }
    ],
  },
  (chunk) => {
    if (chunk.type === "chunk") {
      process.stdout.write(chunk.content || "");
    } else if (chunk.type === "thinking") {
      console.log("\n[Thinking]:", chunk.content);
    } else if (chunk.type === "done") {
      console.log("\n[Stream complete]");
    }
  }
);
```

### Using Configuration from Database

```typescript
import { AIClient, getAIConfig } from "@raypx/ai";

// Get user-specific configuration
const config = await getAIConfig(userId);

// Create client with configuration
const client = new AIClient({
  provider: config.provider || "aliyun",
  apiKey: config.apiKey!,
  apiUrl: config.apiUrl,
  model: config.model || "qwen3-max",
  temperature: config.temperature ?? 0.7,
  maxTokens: config.maxTokens ?? 2000,
});

const response = await client.chat({
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Direct Provider Usage

```typescript
import { AliyunProvider } from "@raypx/ai/providers/aliyun";

const provider = new AliyunProvider({
  provider: "aliyun",
  apiKey: "your-api-key",
  model: "qwen3-max",
});

const response = await provider.chat({
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Architecture

### Provider Pattern

The framework uses a provider pattern where each LLM provider implements the `AIProvider` interface:

```
AIProvider (abstract base)
  ├── LangChainAIProvider (base for LangChain-based providers)
  │   ├── AliyunProvider
  │   ├── OpenAIProvider
  │   └── DeepSeekProvider
  └── [Custom Provider] (can be added)
```

### Adding a New Provider

1. Create a new provider class extending `LangChainAIProvider` (or `AIProvider` for custom implementations):

```typescript
import { LangChainAIProvider } from "@raypx/ai/providers/langchain-base";
import type { LLMProviderConfig } from "@raypx/ai/types";

export class CustomProvider extends LangChainAIProvider {
  protected getBaseURL(): string | undefined {
    return "https://api.custom-provider.com/v1";
  }

  protected getDefaultModel(): string {
    return "custom-model";
  }
}
```

2. Register it in `AIClient`:

```typescript
// In client.ts
private createProvider(config: LLMProviderConfig): AIProvider {
  switch (config.provider) {
    // ... existing providers
    case "custom":
      return new CustomProvider(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
```

## Configuration

Configuration can be set via:

1. **Environment Variables**:
   - `LLM_PROVIDER`: Provider name (default: "aliyun")
   - `LLM_API_KEY`: API key
   - `LLM_API_URL`: API base URL (optional)
   - `LLM_MODEL`: Model name
   - `LLM_TEMPERATURE`: Temperature (default: 0.7)
   - `LLM_MAX_TOKENS`: Max tokens (default: 2000)

2. **Database Configuration**: User-specific configuration stored in the `ai` namespace

## Type Definitions

See `src/types.ts` for complete type definitions.

## License

Apache-2.0
