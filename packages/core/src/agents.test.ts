import { expect, it } from "vitest";
import {
  agentInputSchema,
  agentSchema,
  conversationIdSchema,
  directConversation,
} from "./agents.js";

it("validates configuration without interpreting instructions or model identifiers", () => {
  const input = {
    name: " Helper ",
    instructions: "  Keep this text\n",
    model: { modelId: " chosen-model " },
  };
  expect(agentInputSchema.parse(input)).toEqual({
    ...input,
    name: "Helper",
    model: { modelId: "chosen-model" },
  });
  for (const invalid of [
    { ...input, name: " " },
    { ...input, instructions: "x".repeat(32_001) },
    { ...input, model: { modelId: "" } },
    { ...input, model: { modelId: "model", token: "secret" } },
    { ...input, spaceId: "client-selected" },
  ])
    expect(agentInputSchema.safeParse(invalid).success).toBe(false);
});

it("derives a direct conversation from its Agent's identity, Space and creation time", () => {
  const agent = agentSchema.parse({
    id: "agent",
    spaceId: "space",
    name: "Helper",
    instructions: "",
    model: { modelId: "model" },
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
  });
  expect(directConversation(agent, conversationIdSchema.parse("conversation"))).toEqual({
    id: "conversation",
    spaceId: agent.spaceId,
    agentId: agent.id,
    kind: "direct",
    createdAt: agent.createdAt,
  });
});
