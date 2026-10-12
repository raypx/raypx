import { cursorQueryFields } from "./common.js";
import { procedure } from "./common.js";
import { z } from "zod";

export const accountProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1),
});

export const publicAuthCapabilitiesSchema = z.object({
  registrationAvailable: z.boolean(),
  verificationEmailRequestAvailable: z.boolean(),
  passwordResetRequestAvailable: z.boolean(),
});

export const health = procedure(
  {},
  z.object({
    status: z.literal("ok"),
    timestamp: z.date(),
  }),
);

export const getPublicAuthCapabilities = procedure({}, publicAuthCapabilitiesSchema);

export const getAccountProfile = procedure({}, accountProfileSchema);

export const activitySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  actorId: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.date(),
});
export type ActivityDto = z.infer<typeof activitySchema>;

export const listActivity = procedure(
  { ...cursorQueryFields, projectId: z.string().min(1).optional() },
  z.object({ items: z.array(activitySchema), nextCursor: z.string().nullable() }),
);

export type AccountProfileDto = z.infer<typeof accountProfileSchema>;

export type PublicAuthCapabilitiesDto = z.infer<typeof publicAuthCapabilitiesSchema>;
