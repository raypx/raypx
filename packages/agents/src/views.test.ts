import { expect, it } from "vitest";
import { agentView, conversationView } from "./views.js";

it("projects SQL dates and the opaque model choice into the domain records", () => {
  const date = new Date("2026-11-13T00:00:00.000Z");
  expect(
    agentView({
      id: "a",
      spaceId: "s",
      name: "Helper",
      instructions: "Keep\n whitespace",
      modelId: "chosen-model",
      allowSharedMemory: false,
      allowCrossSpaceMessages: false,
      deletedAt: null,
      createdAt: date,
      updatedAt: date,
    }),
  ).toEqual({
    id: "a",
    spaceId: "s",
    name: "Helper",
    instructions: "Keep\n whitespace",
    model: { modelId: "chosen-model" },
    allowSharedMemory: false,
    allowCrossSpaceMessages: false,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  });
  expect(
    conversationView({
      id: "c",
      spaceId: "s",
      agentId: "a",
      kind: "direct",
      name: null,
      defaultResponderAgentId: null,
      createdAt: date,
    }),
  ).toEqual({ id: "c", spaceId: "s", agentId: "a", kind: "direct", createdAt: date.toISOString() });
});
