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
