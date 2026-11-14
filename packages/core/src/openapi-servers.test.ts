import { expect, it } from "vitest";
import {
  openApiCredentialSchema,
  openApiServerConfigurationSchema,
  openApiServerSchema,
} from "./openapi-servers.js";
import { approvalRuleSchema, openApiToolNameSchema } from "./approvals.js";
const configuration = {
  name: "Reports",
  url: "https://api.example.test",
  selectedOperationIds: ["read"],
  availability: { mode: "all" },
};
it("keeps credentials input-only and validates exact deterministic API tool names", () => {
  expect(openApiCredentialSchema.parse({ type: "bearer", value: "private" })).toEqual({
    type: "bearer",
    value: "private",
  });
  expect(
    openApiCredentialSchema.safeParse({ type: "bearer", value: "private\r\nHost: wrong" }).success,
  ).toBe(false);
  const toolName = openApiToolNameSchema.parse("openapi_00000000000040008000000000000001__read");
  expect(approvalRuleSchema.parse({ toolName, executable: null, decision: "block" })).toMatchObject(
    { toolName },
  );
  expect(openApiToolNameSchema.safeParse("openapi_*__read").success).toBe(false);
  const server = {
    ...configuration,
    id: "00000000-0000-4000-8000-000000000001",
    spaceId: "space",
    operations: [{ operationId: "read", label: "Read", method: "GET", path: "/", readOnly: true }],
    hasCredentials: true,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
  expect(openApiServerSchema.safeParse(server).success).toBe(true);
  expect(openApiServerSchema.safeParse({ ...server, secretId: "private" }).success).toBe(false);
  expect(
    openApiServerSchema.safeParse({ ...server, credential: { type: "bearer", value: "private" } })
      .success,
  ).toBe(false);
});
it("bounds selected operations and forbids duplicate operations/Agents", () => {
  expect(
    openApiServerConfigurationSchema.safeParse({
      ...configuration,
      selectedOperationIds: ["read", "read"],
    }).success,
  ).toBe(false);
  expect(
    openApiServerConfigurationSchema.safeParse({
      ...configuration,
      selectedOperationIds: Array.from({ length: 129 }, (_, index) => `read${index}`),
    }).success,
  ).toBe(false);
  expect(
    openApiServerConfigurationSchema.safeParse({
      ...configuration,
      availability: { mode: "selected", agentIds: ["agent", "agent"] },
    }).success,
  ).toBe(false);
});
