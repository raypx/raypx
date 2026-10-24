export {
  createAiClient,
  type AiClient,
  type AiRequestOptions,
  type AiSelection,
  type AiStream,
} from "./client.js";
export { AiError, type AiErrorCode } from "./errors.js";
export {
  createCompatibleProvider,
  defaultProviders,
  type CompatibleProviderOptions,
} from "./providers.js";
export { Type } from "@earendil-works/pi-ai";
export type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  CredentialStore,
  Message,
  Model,
  Provider,
  Tool,
  ToolCall,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";
