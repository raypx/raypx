import { expect, it } from "vitest";
import {
  belongsToSpace,
  spaceIdSchema,
  spaceInputSchema,
  spaceMemberSchema,
  spaceDirectoryMemberSchema,
  spaceInvitationSchema,
  spaceEventSchema,
  spaceSettingsSchema,
} from "./spaces.js";

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

it("keeps invitation tokens out of public stored projections and preserves strict Space events", () => {
  const invitation = {
    spaceId: "space",
    id: "invitation",
    inviterAccountId: "account",
    inviterName: "Name",
    createdAt: "2026-11-14T00:00:00.000Z",
    expiresAt: "2026-11-21T00:00:00.000Z",
  };
  expect(spaceInvitationSchema.safeParse(invitation).success).toBe(true);
  expect(spaceInvitationSchema.safeParse({ ...invitation, tokenHash: "secret" }).success).toBe(
    false,
  );
  expect(
    spaceEventSchema.safeParse({
      id: 1,
      spaceId: "space",
      kind: "space.member.role_changed",
      payload: { accountId: "account", role: "owner" },
      createdAt: invitation.createdAt,
    }).success,
  ).toBe(true);
  expect(
    spaceEventSchema.safeParse({
      id: 1,
      spaceId: "space",
      kind: "space.member.joined",
      payload: { accountId: "account", email: "private@example.test" },
      createdAt: invitation.createdAt,
    }).success,
  ).toBe(false);
  expect(
    spaceSettingsSchema.safeParse({ spaceId: "space", approvalMode: null, updatedAt: null })
      .success,
  ).toBe(true);
  expect(
    spaceSettingsSchema.safeParse({ spaceId: "space", approvalMode: "auto", updatedAt: null })
      .success,
  ).toBe(true);
  expect(
    spaceDirectoryMemberSchema.safeParse({
      spaceId: "space",
      accountId: "account",
      role: "member",
      createdAt: invitation.createdAt,
      name: "Name",
      image: null,
    }).success,
  ).toBe(true);
});
