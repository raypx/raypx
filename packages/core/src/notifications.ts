import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";
import { conversationIdSchema, agentIdSchema } from "./agents.js";
import { runIdSchema } from "./run-identity.js";
export const notificationKindSchema = z.enum([
  "approval",
  "protected-input",
  "run-succeeded",
  "run-failed",
  "invitation",
]);
export const notificationKeySchema = z.strictObject({
  spaceId: spaceIdSchema,
  kind: notificationKindSchema,
  sourceId: z.string().min(1).max(128),
});
export const notificationSchema = notificationKeySchema.extend({
  spaceName: z.string().max(200),
  conversationId: conversationIdSchema.nullable(),
  agentId: agentIdSchema.nullable(),
  runId: runIdSchema.nullable(),
  createdAt: z.iso.datetime(),
  unread: z.boolean(),
});
export type MemberNotification = z.infer<typeof notificationSchema>;
export type NotificationKey = z.infer<typeof notificationKeySchema>;
export const memberNotificationsSchema = z.strictObject({
  items: z.array(notificationSchema).max(100),
  truncated: z.boolean(),
});
