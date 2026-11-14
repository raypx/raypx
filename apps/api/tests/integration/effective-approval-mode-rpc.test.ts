import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { agentToolsFixture } from "../helpers/agent-tools.js";
import { createApiApp } from "../helpers/app.js";

it("routes the effective approval mode through fresh Space admission without exposing rules", async () => {
  const f = agentToolsFixture();
  const availableModes = [
    { mode: "ask", available: true, reasonCode: null },
    { mode: "never", available: true, reasonCode: null },
    { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  ] as const;
  const getEffectiveMode = vi.fn<typeof f.agentApprovals.getEffectiveMode>(async (scope) => ({
    spaceId: scope.spaceId,
    mode: "never",
    source: "space_override",
    availableModes: [...availableModes],
  }));
  const resolve = vi.fn((...args: Parameters<typeof f.spaces.resolve>) =>
    f.spaces.resolve(...args),
  );
  const app = createApiApp({
    spaces: { ...f.spaces, resolve },
    agentApprovals: { ...f.agentApprovals, getEffectiveMode },
    readSession: f.readSession,
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  try {
    expect(await client.approvals.effectiveMode({ spaceId: f.spaceId })).toEqual({
      spaceId: f.spaceId,
      mode: "never",
      source: "space_override",
      availableModes,
    });
    expect(getEffectiveMode).toHaveBeenCalledExactlyOnceWith(f.scope);
    expect(resolve).toHaveBeenCalledExactlyOnceWith("member", f.spaceId);
  } finally {
    await f.runner.close();
  }
});
