export { createModelGateway } from "./model-gateway.js";
export type { ModelGatewayRequest, ModelGatewayTransport } from "./model-gateway.js";
export { searchWeb, readPublicSource, isPublicAddress, validateSourceUrl } from "./research.js";
export {
  createCloudPiAgent,
  normalizeModelUsage,
  checkPiRuntime,
  CloudModelUnavailableError,
} from "./cloud-pi.js";
export type {
  CloudPiAgent,
  CloudPiOptions,
  CloudPiRunInput,
  TrustedAiTool,
  ModelCallHooks,
  ModelUsage,
} from "./cloud-pi.js";

export type AiRunEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "message_completed";
      text: string;
      stopReason: string;
      usage?: import("./cloud-pi.js").ModelUsage;
    }
  | { type: "thinking"; active: boolean }
  | { type: "tool_call"; callId: string; name: string; input: unknown }
  | { type: "tool_result"; callId: string; name: string; output: unknown; isError?: boolean }
  | { type: "completed"; text: string }
  | { type: "failed"; message: string }
  | { type: "cancelled" };
