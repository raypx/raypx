export {
  createAiClient,
  type AiClient,
  type AiRequestOptions,
  type AiSelection,
  type AiStream,
} from "./client.ts";
export { AiError, type AiErrorCode } from "./errors.ts";
export {
  createCompatibleProvider,
  defaultProviders,
  type CompatibleProviderOptions,
} from "./providers.ts";
export { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
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

export { prepareModelContext } from "./context.ts";
