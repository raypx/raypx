import { CloudDomainError, type CloudUsageCall } from "@raypx/core";

export interface UsageSettlementInput {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  started?: boolean;
}

type Settlement = Pick<
  CloudUsageCall,
  | "state"
  | "inputTokens"
  | "outputTokens"
  | "cacheReadTokens"
  | "cacheWriteTokens"
  | "estimatedCost"
>;

/** Pure accounting only; callers retain their fence, replay, persistence and event policies. */
export function usageSettlement(
  call: Readonly<Pick<CloudUsageCall, "state" | "reservedTokens" | "pricing">>,
  input: UsageSettlementInput,
): Settlement {
  for (const value of [
    input.inputTokens,
    input.outputTokens,
    input.cacheReadTokens,
    input.cacheWriteTokens,
  ])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new CloudDomainError("CLOUD_INVALID_INPUT", "Invalid usage count.");
  const known = input.inputTokens !== undefined && input.outputTokens !== undefined;
  const state = known
    ? "settled"
    : input.started === false && call.state === "reserved"
      ? "released"
      : "unknown";
  const inputTokens = input.inputTokens ?? null;
  const outputTokens = input.outputTokens ?? null;
  const cacheReadTokens = input.cacheReadTokens ?? null;
  const cacheWriteTokens = input.cacheWriteTokens ?? null;
  return {
    state,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    estimatedCost: call.pricing
      ? ((inputTokens ?? call.reservedTokens) * call.pricing.inputPerMillion +
          (outputTokens ?? call.reservedTokens) * call.pricing.outputPerMillion +
          (cacheReadTokens ?? 0) *
            (call.pricing.cacheReadPerMillion ?? call.pricing.inputPerMillion) +
          (cacheWriteTokens ?? 0) *
            (call.pricing.cacheWritePerMillion ?? call.pricing.inputPerMillion)) /
        1_000_000
      : null,
  };
}
