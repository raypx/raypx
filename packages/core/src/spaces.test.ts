import { expect, it } from "vitest";
import { belongsToSpace, spaceIdSchema, spaceInputSchema, spaceMemberSchema } from "./spaces.js";

it("validates Space names and admits only the matching account and Space", () => {
  expect(spaceInputSchema.parse({ name: " Work " })).toEqual({ name: "Work" });
  expect(spaceInputSchema.safeParse({ name: " " }).success).toBe(false);
  const spaceId = spaceIdSchema.parse("space-a");
  for (const role of ["owner", "member"] as const) {
    const member = spaceMemberSchema.parse({
      spaceId,
      accountId: "account",
      role,
      createdAt: "2026-11-13T00:00:00.000Z",
    });
    expect(belongsToSpace(member, "account", spaceId)).toBe(true);
    expect(belongsToSpace(member, "another", spaceId)).toBe(false);
    expect(belongsToSpace(member, "account", spaceIdSchema.parse("space-b"))).toBe(false);
  }
  expect(spaceMemberSchema.shape.role.safeParse("admin").success).toBe(false);
});
