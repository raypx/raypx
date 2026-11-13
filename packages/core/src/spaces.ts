import { z } from "zod";

export const spaceIdSchema = z.string().min(1).max(128).brand<"SpaceId">();
export type SpaceId = z.infer<typeof spaceIdSchema>;
export const spaceRoleSchema = z.enum(["owner", "member"]);
export type SpaceRole = z.infer<typeof spaceRoleSchema>;
export const spaceInputSchema = z.strictObject({ name: z.string().trim().min(1).max(120) });
export const spaceSchema = spaceInputSchema.extend({
  id: spaceIdSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Space = z.infer<typeof spaceSchema>;
export type SpaceInput = z.infer<typeof spaceInputSchema>;
export const spaceMemberSchema = z.strictObject({
  spaceId: spaceIdSchema,
  accountId: z.string().min(1).max(128),
  role: spaceRoleSchema,
  createdAt: z.iso.datetime(),
});
export type SpaceMember = z.infer<typeof spaceMemberSchema>;

export const spaceDirectoryMemberSchema = spaceMemberSchema.extend({
  name: z.string(),
  image: z.string().nullable(),
  email: z.string().optional(),
});
export type SpaceDirectoryMember = z.infer<typeof spaceDirectoryMemberSchema>;
export const spaceInvitationSchema = z.strictObject({
  spaceId: spaceIdSchema,
  id: z.string().min(1).max(128),
  inviterAccountId: z.string(),
  inviterName: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type SpaceInvitation = z.infer<typeof spaceInvitationSchema>;
export const issuedSpaceInvitationSchema = spaceInvitationSchema.extend({ token: z.string() });
export const spaceInvitationPreviewSchema = z.strictObject({
  spaceId: spaceIdSchema,
  spaceName: z.string(),
  inviterName: z.string(),
  expiresAt: z.iso.datetime(),
  alreadyMember: z.boolean(),
  shares: z.tuple([
    z.literal("agents"),
    z.literal("conversations"),
    z.literal("memory"),
    z.literal("routines"),
    z.literal("team_computer"),
    z.literal("pages"),
  ]),
});
export const spaceInvitationAcceptanceSchema = z.strictObject({
  space: spaceSchema,
  member: spaceMemberSchema,
  joined: z.boolean(),
});
export const spaceSettingsSchema = z.strictObject({
  spaceId: spaceIdSchema,
  approvalMode: z.enum(["ask", "never"]).nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;
export const spaceAuditOutcomeSchema = z.enum(["pending", "succeeded", "refused", "failed"]);
export const spaceAuditEntrySchema = z.strictObject({
  spaceId: spaceIdSchema,
  id: z.string(),
  operationId: z.string(),
  actorAccountId: z.string(),
  action: z.string(),
  targetId: z.string().nullable(),
  outcome: spaceAuditOutcomeSchema,
  code: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SpaceAuditEntry = z.infer<typeof spaceAuditEntrySchema>;
export const spaceAuditPageSchema = z.strictObject({
  items: z.array(spaceAuditEntrySchema),
  nextCursor: z.string().nullable(),
});
export const spaceMemberRemovalSchema = z.strictObject({
  accountId: z.string(),
  pausedRoutines: z.array(z.strictObject({ id: z.string(), name: z.string() })),
});
export const spaceMutationErrorCodeSchema = z.enum([
  "SPACE_OWNER_REQUIRED",
  "SPACE_LAST_OWNER",
  "SPACE_LAST_PRIVATE",
  "INVITATION_NOT_FOUND",
  "INVITATION_EXPIRED",
  "INVITATION_CANCELLED",
  "INVITATION_CONSUMED",
  "SPACE_AUDIT_UNAVAILABLE",
  "INVALID_AUDIT_CURSOR",
  "REVIEW_MODEL_NOT_CONFIGURED",
]);
export type SpaceMutationErrorCode = z.infer<typeof spaceMutationErrorCodeSchema>;
export class SpaceMutationError extends Error {
  constructor(readonly code: SpaceMutationErrorCode) {
    super(code);
    this.name = "SpaceMutationError";
  }
}
export const spaceEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: z.number().int().positive(),
    spaceId: spaceIdSchema,
    kind: z.literal("space.member.joined"),
    payload: z.strictObject({ accountId: z.string() }),
    createdAt: z.iso.datetime(),
  }),
  z.strictObject({
    id: z.number().int().positive(),
    spaceId: spaceIdSchema,
    kind: z.literal("space.member.removed"),
    payload: z.strictObject({ accountId: z.string() }),
    createdAt: z.iso.datetime(),
  }),
  z.strictObject({
    id: z.number().int().positive(),
    spaceId: spaceIdSchema,
    kind: z.literal("space.member.role_changed"),
    payload: z.strictObject({ accountId: z.string(), role: spaceRoleSchema }),
    createdAt: z.iso.datetime(),
  }),
  z.strictObject({
    id: z.number().int().positive(),
    spaceId: spaceIdSchema,
    kind: z.literal("space.renamed"),
    payload: z.strictObject({ name: z.string() }),
    createdAt: z.iso.datetime(),
  }),
]);
export type SpaceEvent = z.infer<typeof spaceEventSchema>;

/** Deployment roles never participate in Space admission. */
export function belongsToSpace(member: SpaceMember, accountId: string, spaceId: SpaceId): boolean {
  return member.accountId === accountId && member.spaceId === spaceId;
}

export class SpaceNotFound extends Error {
  constructor() {
    super("Space record not found");
    this.name = "SpaceNotFound";
  }
}
