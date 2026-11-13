import { expect, it } from "vitest";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { AgentsPageState } from "./page.js";
import {
  applyAgents,
  applyGroups,
  createAgentsPageState,
  parseAgentSelection,
  selectAgent,
  selectGroup,
  selectSpace,
} from "./page.js";
const time = "2026-11-14T00:00:00Z";
const agent = agentSchema.parse({
  id: "writer",
  spaceId: "space",
  name: "Writer",
  instructions: "",
  model: { modelId: "model" },
  createdAt: time,
  updatedAt: time,
});
const direct = conversationSchema.parse({
  id: "direct",
  spaceId: "space",
  agentId: agent.id,
  kind: "direct",
  createdAt: time,
});
const group = conversationSchema.parse({
  ...direct,
  id: "group",
  kind: "group",
  name: "Team",
  agentIds: [agent.id, "reviewer"],
});
it("selects groups separately from direct Agents and restores a group URL", () => {
  let state: AgentsPageState = {
    ...createAgentsPageState(),
    spaceId: spaceIdSchema.parse("space"),
  };
  state = applyAgents(state, "space", [{ agent, conversation: direct }]);
  state = applyGroups(state, "space", [{ conversation: group, agents: [agent] }], "group");
  expect(state).toMatchObject({ groupId: "group", agentId: null });
  expect(parseAgentSelection({ spaceId: "space", groupId: "group" })).toEqual({
    spaceId: "space",
    groupId: "group",
  });
  state = selectAgent(state, agent.id);
  expect(state).toMatchObject({ agentId: agent.id, groupId: null });
  state = selectGroup(state, group.id);
  expect(state).toMatchObject({ agentId: null, groupId: group.id });
  expect(selectGroup(state, "unavailable")).toBe(state);
  expect(applyGroups(state, "other", [], "group")).toBe(state);
});
it("clears groups with their Space and retains direct conversation fields", () => {
  let state: AgentsPageState = {
    ...createAgentsPageState(),
    spaceId: spaceIdSchema.parse("space"),
    spaces: [
      {
        space: {
          id: spaceIdSchema.parse("other"),
          name: "Other",
          createdAt: time,
          updatedAt: time,
        },
        member: {
          spaceId: spaceIdSchema.parse("other"),
          accountId: "member",
          role: "member" as const,
          createdAt: time,
        },
      },
    ],
  };
  state = applyGroups(state, "space", [{ conversation: group, agents: [agent] }], "group");
  state = selectSpace(state, "other");
  expect(state).toMatchObject({ groupId: null, groups: [], agentId: null, agents: [] });
});
