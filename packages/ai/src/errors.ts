const messages = {
  AI_INVALID_CONFIG: "AI configuration is invalid.",
  AI_MODEL_NOT_FOUND: "The configured AI model is unavailable.",
  AI_AUTH_REQUIRED: "Configure credentials for this AI provider.",
  AI_RATE_LIMITED: "The AI provider rate limit was reached.",
  AI_REQUEST_FAILED: "The AI request failed.",
  AI_ABORTED: "The AI request was cancelled.",
  AI_TIMEOUT: "The AI request timed out.",
  AI_CLOSED: "The AI client is closed.",
} as const;

export type AiErrorCode = keyof typeof messages;
export class AiError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(messages[code]);
    this.name = "AiError";
  }
}
