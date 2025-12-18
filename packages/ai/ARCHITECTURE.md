# AI Framework Architecture

## Overview

The `@raypx/ai` package provides a unified interface for interacting with different LLM providers. It abstracts away provider-specific details and provides a clean, extensible API.

## Design Principles

1. **Separation of Concerns**: AI logic is separated from RAG logic
2. **Provider Abstraction**: All providers implement a common interface
3. **Extensibility**: Easy to add new providers
4. **Type Safety**: Full TypeScript support with proper types
5. **Configuration Flexibility**: Support for both environment variables and database configuration

## Architecture Layers

```
┌─────────────────────────────────────────┐
│         Application Layer                │
│  (RAG, Chat Routes, etc.)                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         AIClient (Unified Interface)     │
│  - chat()                                │
│  - chatStream()                          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Provider Layer                   │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │ Aliyun   │  │ OpenAI   │  │DeepSeek ││
│  │ Provider │  │ Provider │  │Provider ││
│  └──────────┘  └──────────┘  └─────────┘│
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      LangChain Base Provider            │
│  - Common LangChain functionality        │
│  - Message conversion                    │
│  - Thinking extraction                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         LangChain Framework              │
│  - ChatOpenAI                            │
│  - BaseMessage                           │
└──────────────────────────────────────────┘
```

## Core Components

### 1. Types (`src/types.ts`)

Defines all TypeScript interfaces and types:
- `LLMProvider`: Supported provider names
- `ChatMessage`: Message structure
- `LLMProviderConfig`: Provider configuration
- `ChatCompletionOptions`: Chat request options
- `ChatCompletionResponse`: Chat response structure
- `StreamChunk`: Streaming chunk types

### 2. Base Provider (`src/providers/base.ts`)

Abstract base class `AIProvider` that all providers must implement:
- `chat()`: Non-streaming chat completion
- `chatStream()`: Streaming chat completion
- `validateConfig()`: Configuration validation

### 3. LangChain Base Provider (`src/providers/langchain-base.ts`)

`LangChainAIProvider` extends `AIProvider` and provides:
- Common LangChain setup
- Message conversion (ChatMessage ↔ BaseMessage)
- Thinking/reasoning extraction
- Stream handling

### 4. Provider Implementations

Each provider extends `LangChainAIProvider`:
- **AliyunProvider** (`src/providers/aliyun.ts`): Alibaba Cloud DashScope
- **OpenAIProvider** (`src/providers/openai.ts`): OpenAI API
- **DeepSeekProvider** (`src/providers/deepseek.ts`): DeepSeek API

Each provider implements:
- `getBaseURL()`: Provider-specific API URL
- `getDefaultModel()`: Default model name

### 5. AIClient (`src/client.ts`)

Unified client interface:
- Factory pattern for creating providers
- Unified API for all providers
- Configuration management

### 6. Configuration (`src/config.ts`)

Configuration management:
- Database-backed configuration (user-specific)
- Environment variable fallback
- Default values

## Usage Patterns

### Pattern 1: Direct Client Usage

```typescript
import { AIClient } from "@raypx/ai";

const client = new AIClient({
  provider: "aliyun",
  apiKey: "key",
  model: "qwen3-max",
});

const response = await client.chat({
  messages: [{ role: "user", content: "Hello" }],
});
```

### Pattern 2: Configuration-Based Usage

```typescript
import { AIClient, getAIConfig } from "@raypx/ai";

const config = await getAIConfig(userId);
const client = new AIClient({
  provider: config.provider || "aliyun",
  apiKey: config.apiKey!,
  model: config.model || "qwen3-max",
});
```

### Pattern 3: Direct Provider Usage

```typescript
import { AliyunProvider } from "@raypx/ai/providers/aliyun";

const provider = new AliyunProvider({
  provider: "aliyun",
  apiKey: "key",
  model: "qwen3-max",
});
```

## Adding a New Provider

1. **Create Provider Class**:

```typescript
// src/providers/custom.ts
import { LangChainAIProvider } from "./langchain-base";
import type { LLMProviderConfig } from "../types";

export class CustomProvider extends LangChainAIProvider {
  protected getBaseURL(): string | undefined {
    return "https://api.custom.com/v1";
  }

  protected getDefaultModel(): string {
    return "custom-model";
  }
}
```

2. **Register in AIClient**:

```typescript
// src/client.ts
import { CustomProvider } from "./providers/custom";

private createProvider(config: LLMProviderConfig): AIProvider {
  switch (config.provider) {
    // ... existing cases
    case "custom":
      return new CustomProvider(config);
  }
}
```

3. **Update Types**:

```typescript
// src/types.ts
export type LLMProvider = "aliyun" | "openai" | "deepseek" | "custom";
```

## Integration with RAG Package

The `@raypx/rag` package uses `@raypx/ai` for LLM interactions:

```typescript
// packages/rag/src/chat.ts
import { AIClient } from "@raypx/ai";

// Create client and use for chat
const aiClient = new AIClient({ ... });
const response = await aiClient.chat({ ... });
```

**Note**: LangChain retrievers still use `ChatOpenAI` directly because they require LangChain's `BaseLanguageModel` type. This is acceptable as it's an internal implementation detail.

## Benefits

1. **Maintainability**: Single place to update LLM logic
2. **Testability**: Easy to mock providers for testing
3. **Extensibility**: Simple to add new providers
4. **Consistency**: Unified interface across all providers
5. **Type Safety**: Full TypeScript support

## Future Enhancements

1. **Provider Registry**: Dynamic provider registration
2. **Retry Logic**: Built-in retry mechanisms
3. **Rate Limiting**: Provider-specific rate limiting
4. **Caching**: Response caching layer
5. **Metrics**: Provider usage metrics
6. **Fallback**: Automatic fallback to backup providers
