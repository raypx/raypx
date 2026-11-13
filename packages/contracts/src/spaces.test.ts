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
    [apiContract.agents.models, { spaceId: "space" }, { credentialId: "private" }],
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

it("offers a strict model projection containing identifiers and display names only", async () => {
  const schema = apiContract.agents.models["~orpc"].outputSchemas?.[0];
  if (!schema) throw new Error("Missing model projection schema");
  const offered = [{ modelId: "chat", name: "Friendly chat" }];
  expect((await schema["~standard"].validate(offered)).issues).toBeUndefined();
  for (const privateValue of [
    { credential: "secret" },
    { endpoint: "https://provider.invalid" },
    { provider: "vendor" },
  ])
    expect(
      (await schema["~standard"].validate([{ ...offered[0], ...privateValue }])).issues,
    ).toBeDefined();
});

it("accepts membership targets but rejects caller-selected admission and invitation roles", async () => {
  const cases = [
    [
      apiContract.spaces.updateMemberRole,
      { spaceId: "space", accountId: "target", role: "member" },
      { actorAccountId: "owner" },
    ],
    [
      apiContract.spaces.removeMember,
      { spaceId: "space", accountId: "target" },
      { member: { role: "owner" } },
    ],
    [apiContract.spaces.acceptInvitation, { token: "ab".repeat(32) }, { role: "owner" }],
    [
      apiContract.spaces.createInvitation,
      { spaceId: "space" },
      { expiresAt: "2099-01-01T00:00:00.000Z" },
    ],
  ] as const;
  for (const [procedure, input, forged] of cases) {
    const schema = procedure["~orpc"].inputSchemas?.[0];
    if (!schema) throw new Error("Missing input schema");
    expect((await schema["~standard"].validate(input)).issues).toBeUndefined();
    expect((await schema["~standard"].validate({ ...input, ...forged })).issues).toBeDefined();
  }
});

it("never returns invitation tokens from listings and bounds audit/event pagination", async () => {
  const invitation = {
    id: "invite",
    spaceId: "space",
    inviterAccountId: "owner",
    inviterName: "Owner",
    createdAt: "2026-11-14T00:00:00.000Z",
    expiresAt: "2026-11-21T00:00:00.000Z",
  };
  const output = apiContract.spaces.invitations["~orpc"].outputSchemas?.[0];
  if (!output) throw new Error("Missing invitation schema");
  expect((await output["~standard"].validate([invitation])).issues).toBeUndefined();
  expect(
    (await output["~standard"].validate([{ ...invitation, token: "ab".repeat(32) }])).issues,
  ).toBeDefined();
  for (const procedure of [apiContract.spaces.audit, apiContract.spaces.events]) {
    const schema = procedure["~orpc"].inputSchemas?.[0];
    if (!schema) throw new Error("Missing pagination schema");
    expect(
      (await schema["~standard"].validate({ spaceId: "space", limit: 101 })).issues,
    ).toBeDefined();
  }
});
