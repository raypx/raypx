import { describe, expect, it } from "vite-plus/test";
import { usageSettlement } from "./usage-settlement.js";

const reservation = {
  state: "reserved" as const,
  reservedTokens: 100,
  pricing: { inputPerMillion: 2, outputPerMillion: 4 },
};

describe("usage settlement accounting", () => {
  it("settles reported zero counts without mutating the reservation", () => {
    const call = Object.freeze({ ...reservation });
    expect(usageSettlement(call, { inputTokens: 0, outputTokens: 0, started: false })).toEqual({
      state: "settled",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      estimatedCost: 0,
    });
    expect(call.state).toBe("reserved");
  });

  it.each(["reserved", "started", "unknown"] as const)(
    "only releases an undispatched reservation: %s",
    (state) => {
      expect(usageSettlement({ ...reservation, state }, { started: false })).toMatchObject({
        state: state === "reserved" ? "released" : "unknown",
        inputTokens: null,
        outputTokens: null,
        estimatedCost: 600 / 1_000_000,
      });
    },
  );

  it("estimates incomplete usage from reserved tokens and retains reported counts", () => {
    expect(usageSettlement(reservation, { inputTokens: 10, cacheReadTokens: 20 })).toEqual({
      state: "unknown",
      inputTokens: 10,
      outputTokens: null,
      cacheReadTokens: 20,
      cacheWriteTokens: null,
      estimatedCost: (20 + 400 + 40) / 1_000_000,
    });
    expect(usageSettlement(reservation, {})).toMatchObject({ state: "unknown" });
  });

  it("keeps missing prices nullable and honors explicit zero cache prices", () => {
    const input = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 };
    expect(usageSettlement({ ...reservation, pricing: null }, input).estimatedCost).toBeNull();
    expect(
      usageSettlement(
        {
          ...reservation,
          pricing: { ...reservation.pricing, cacheReadPerMillion: 0, cacheWritePerMillion: 3 },
        },
        input,
      ).estimatedCost,
    ).toBe((20 + 80 + 0 + 120) / 1_000_000);
  });

  it.each(["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const)(
    "rejects invalid %s counts",
    (field) => {
      for (const value of [
        -1,
        0.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
      ])
        expect(() => usageSettlement(reservation, { [field]: value })).toThrow(
          expect.objectContaining({ code: "CLOUD_INVALID_INPUT", message: "Invalid usage count." }),
        );
    },
  );
});
