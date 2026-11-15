import { expect, it } from "vitest";
import { agentIdentityIndex } from "./identity.js";

it("keeps identity stable and bounded across sessions and arbitrary IDs", () => {
  expect(agentIdentityIndex("agent-research")).toBe(1);
  const indices = new Set(Array.from({ length: 100 }, (_, i) => agentIdentityIndex(`agent-${i}`)));
  expect([...indices].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(agentIdentityIndex("研究員🪴")).toBe(agentIdentityIndex("研究員🪴"));
});
