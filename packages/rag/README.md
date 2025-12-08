# @raypx/rag

RAG (Retrieval-Augmented Generation) package for document vectorization, search, and chat.

## Features

- **Document Vectorization**: Extract text from PDF files using LangChain PDFLoader
- **Intelligent Chunking**: Split documents using LangChain RecursiveCharacterTextSplitter
- **Embedding Generation**: Generate embeddings using LangChain (supports OpenAI, Hugging Face, Cohere, DeepSeek, Alibaba Cloud, and more)
- **Vector Storage**: Store embeddings in PostgreSQL with pgvector
- **Advanced Retrieval**: Multi-query and contextual compression retrieval
- **Chat Interface**: Streaming chat with document context

## Usage

### Vectorize a Document

```typescript
import { vectorizeDocument } from "@raypx/rag";

const result = await vectorizeDocument(documentId, userId, {
  chunkSize: 1000,
  chunkOverlap: 200,
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1024,
});

console.log(`Created ${result.chunksCreated} chunks and ${result.embeddingsCreated} embeddings`);
```

### Generate Embeddings

```typescript
import { generateEmbeddings } from "@raypx/rag";

// Using default provider from environment variables
const embeddings = await generateEmbeddings(texts);

// Or specify provider explicitly
const embeddings = await generateEmbeddings(texts, {
  provider: "huggingface",
  model: "sentence-transformers/all-MiniLM-L6-v2",
});
```

## Environment Variables

### Provider Selection
- `EMBEDDING_PROVIDER`: Provider to use - `openai`, `huggingface`, `cohere`, `deepseek`, or `aliyun` (default: `openai`)
- `EMBEDDING_API_KEY`: Unified API key for all providers (required for OpenAI, Cohere, DeepSeek; optional for Hugging Face)
- `EMBEDDING_API_URL`: Custom API URL for self-hosted models (optional, defaults to `https://api.deepseek.com` for DeepSeek)

### OpenAI (when `EMBEDDING_PROVIDER=openai`)
- `EMBEDDING_API_KEY`: OpenAI API key (required)
- `EMBEDDING_MODEL`: Model name (default: `text-embedding-3-small`)
- `EMBEDDING_DIMENSIONS`: Embedding dimensions (default: `1024`)

### Hugging Face (when `EMBEDDING_PROVIDER=huggingface`)
- `EMBEDDING_API_KEY`: Hugging Face API key (optional, for rate limits)
- `EMBEDDING_MODEL`: Model name (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `EMBEDDING_API_URL`: Custom API URL for self-hosted models (optional)

### Cohere (when `EMBEDDING_PROVIDER=cohere`)
- `EMBEDDING_API_KEY`: Cohere API key (required)
- `EMBEDDING_MODEL`: Model name (default: `embed-english-v3.0`)

### DeepSeek (when `EMBEDDING_PROVIDER=deepseek`)
- `EMBEDDING_API_KEY`: DeepSeek API key (required)
- `EMBEDDING_MODEL`: Model name (default: `text-embedding-3-small`, but DeepSeek may not support embeddings)
- `EMBEDDING_DIMENSIONS`: Embedding dimensions (optional)
- `EMBEDDING_API_URL`: API endpoint (optional, defaults to `https://api.deepseek.com/v1`)

**⚠️ Warning**: DeepSeek primarily provides chat models and may not support embeddings API. If you encounter `MODEL_NOT_FOUND` (404) errors, consider using OpenAI, Hugging Face, Cohere, or Alibaba Cloud for embeddings instead.

### Alibaba Cloud / DashScope (when `EMBEDDING_PROVIDER=aliyun`)
- `EMBEDDING_API_KEY`: Alibaba Cloud API key (DashScope API key, required)
- `EMBEDDING_MODEL`: Model name (default: `text-embedding-v2`)
- `EMBEDDING_DIMENSIONS`: Embedding dimensions (optional)
- `EMBEDDING_API_URL`: API endpoint (optional, defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`)

**Note**: Alibaba Cloud DashScope provides OpenAI-compatible embedding API through their compatible mode endpoint.

### Chunking Configuration
- `CHUNK_SIZE`: Chunk size in characters (default: `1000`)
- `CHUNK_OVERLAP`: Chunk overlap in characters (default: `200`)

## Supported Providers

### 1. OpenAI
- Models: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
- Dimensions: 1024 (small), 3072 (large), 1536 (ada-002)
- Cost: Pay per token

### 2. Hugging Face
- Models: Any sentence-transformers model
- Popular: `sentence-transformers/all-MiniLM-L6-v2` (384 dims), `BAAI/bge-large-en-v1.5` (1024 dims)
- Cost: Free (with API key) or self-hosted

### 3. Cohere
- Models: `embed-english-v3.0`, `embed-multilingual-v3.0`
- Dimensions: 1024
- Cost: Pay per request

### 4. DeepSeek
- Models: `text-embedding-3-small` (fallback, DeepSeek may not support embeddings)
- Dimensions: Configurable
- Cost: Pay per token (typically cheaper than OpenAI)
- Note: DeepSeek may not support embeddings API, consider using other providers

### 5. Alibaba Cloud / DashScope (阿里云)
- Models: `text-embedding-v1`, `text-embedding-v2` (通义千问)
- Dimensions: Configurable (typically 1536 for v2)
- Cost: Pay per token (competitive pricing, good for Chinese users)
- Note: Uses OpenAI-compatible API format through DashScope compatible mode
- API Endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1`

## Supported File Types

- PDF (`.pdf`) - Using LangChain PDFLoader

## Architecture

1. **Document Loading**: Load PDF files using LangChain PDFLoader
2. **Chunking**: Split documents using LangChain RecursiveCharacterTextSplitter
3. **Embedding**: Generate vector embeddings using LangChain (supports multiple providers)
4. **Storage**: Store chunks and embeddings in PostgreSQL with pgvector
5. **Retrieval**: Advanced retrieval with multi-query and contextual compression
6. **Chat**: Streaming chat interface with document context

## Why LangChain?

LangChain provides:
- **Unified Interface**: Same API for all embedding providers
- **Easy Integration**: Simple configuration and usage
- **Extensibility**: Easy to add new providers
- **Community Support**: Well-maintained and widely used
- **Multiple Providers**: OpenAI, Hugging Face, Cohere, and more out of the box

