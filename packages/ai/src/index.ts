export * from "./cache";
export * from "./providers";
export * from "./services";
export * from "./types";

import type { AICache } from "./cache";
import { AnalysisService } from "./services/analysis";
import { ChatService } from "./services/chat";
import { GenerationService } from "./services/generation";

export function createAIServices(cache: AICache, openaiKey?: string, anthropicKey?: string) {
  return {
    chat: new ChatService(cache, openaiKey, anthropicKey),
    generation: new GenerationService(cache, openaiKey, anthropicKey),
    analysis: new AnalysisService(cache, openaiKey, anthropicKey),
  };
}
