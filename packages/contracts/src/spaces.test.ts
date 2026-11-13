import { expect, it } from "vitest";
import { apiContract, getRpcAccess } from "./api.js";

it("requires a session on every Space/Agent procedure without deployment-role policy", () => {
  for (const group of [apiContract.spaces, apiContract.agents]) {
    for (const procedure of Object.values(group)) expect(getRpcAccess(procedure)).toBe("session");
  }
});

it("accepts a resource selector while rejecting supplied scopes, member roles and identities", async () => {
  const agent = { name: "Helper", instructions: "", model: { modelId: "model" } };
  const cases = [
    [apiContract.spaces.list, {}, { accountId: "other" }],
    [apiContract.spaces.create, { name: "Work" }, { role: "owner" }],
    [apiContract.agents.list, { spaceId: "space" }, { scope: { spaceId: "space", role: "owner" } }],
    [apiContract.agents.create, { spaceId: "space", agent }, { conversationId: "client-id" }],
    [apiContract.agents.get, { spaceId: "space", id: "agent" }, { accountId: "other" }],
    [
      apiContract.agents.update,
      { spaceId: "space", id: "agent", agent },
      { member: { role: "owner" } },
    ],
    [apiContract.agents.delete, { spaceId: "space", id: "agent" }, { role: "owner" }],
  ] as const;
  for (const [procedure, input, forged] of cases) {
    const schema = procedure["~orpc"].inputSchemas?.[0];
    if (!schema) throw new Error("Missing input schema");
    expect((await schema["~standard"].validate(input)).issues).toBeUndefined();
    expect((await schema["~standard"].validate({ ...input, ...forged })).issues).toBeDefined();
  }
});
