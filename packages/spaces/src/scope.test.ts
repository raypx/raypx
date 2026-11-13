import { expect, it } from "vitest";
import { spaceIdSchema, spaceMemberSchema, SpaceNotFound } from "@raypx/core/spaces";
import { resolveSpaceScope } from "./scope.js";

it("derives admission from a matching member row for either Space role", () => {
  const id = spaceIdSchema.parse("space");
  for (const role of ["owner", "member"] as const) {
    const member = spaceMemberSchema.parse({
      spaceId: id,
      accountId: "account",
      role,
      createdAt: "2026-11-13T00:00:00.000Z",
    });
    expect(resolveSpaceScope(member, "account", id)).toMatchObject({ spaceId: id, member });
    expect(() => resolveSpaceScope(member, "admin", id)).toThrow(SpaceNotFound);
    expect(() => resolveSpaceScope(member, "account", spaceIdSchema.parse("other"))).toThrow(
      SpaceNotFound,
    );
  }
});
