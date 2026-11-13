export const TOOL_DEADLINE_MS = 60_000;
// Also covers lazy provisioning, provider dispatch/cancellation and persistence.
// A different process must not mistake a live command intent for an interruption.
export const EFFECT_INTENT_TIMEOUT_MS = TOOL_DEADLINE_MS + 9 * 60_000;
