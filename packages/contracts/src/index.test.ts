import { describe, expect, it } from "vite-plus/test";

import { apiContract, projectScopeV2Schema, projectV2Schema } from "./index.js";
import { activitySchema } from "./account.js";

it("preserves Activity fields and native dates while rejecting string timestamps", () => {
  const occurredAt = new Date("2026-09-28T00:00:00Z");
  const activity = {
    id: "event",
    projectId: "project",
    actorId: "actor",
    type: "updated",
    payload: { title: "Film" },
    occurredAt,
  };
  expect(activitySchema.parse(activity)).toEqual(activity);
  expect(activitySchema.parse(activity).occurredAt).toBe(occurredAt);
  expect(
    activitySchema.safeParse({ ...activity, occurredAt: occurredAt.toISOString() }).success,
  ).toBe(false);
});

describe("V2 account-first project contract", () => {
  it("models personal projects without a client-supplied owner id", () => {
    const timestamp = new Date("2026-09-12T00:00:00.000Z");
    expect(projectScopeV2Schema.parse({ type: "personal" })).toEqual({ type: "personal" });
    expect(
      projectV2Schema.parse({
        id: "project-v2-1",
        createdByUserId: "user-1",
        personalOwnerId: "user-1",
        organizationId: null,
        title: "Personal project",
        description: null,
        stage: "draft",
        archived: false,
        deadline: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).createdAt,
    ).toBe(timestamp);
  });

  it("rejects a project with both ownership scopes", () => {
    expect(() =>
      projectV2Schema.parse({
        id: "project-v2-1",
        createdByUserId: "user-1",
        personalOwnerId: "user-1",
        organizationId: "org-1",
        title: "Invalid project",
        description: null,
        stage: "draft",
        archived: false,
        deadline: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrow();
  });
});

it("exposes account and Cloud capabilities without retired administration contracts", () => {
  expect(apiContract).toHaveProperty("account.get");
  expect(apiContract.cloud).toHaveProperty("usage.get");
  expect(apiContract).not.toHaveProperty("admin");
  expect(apiContract.cloud).not.toHaveProperty("admin");
});
