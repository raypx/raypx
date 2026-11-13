import { exposeApiTo } from "./api-exposure.js";
import { oc } from "@orpc/contract";
import { taskContextTargetSchema } from "@raypx/core/tasks";
import { z } from "zod";

export const MAX_SESSION_ATTACHMENT_BYTES = 24_000;
export const MAX_SESSION_ATTACHMENT_CHARACTERS = 8_000;
export const sessionAttachmentInputSchema = taskContextTargetSchema.extend({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\p{Cc}/\\]+$/u),
  data: z
    .base64()
    .min(4)
    .max((MAX_SESSION_ATTACHMENT_BYTES / 3) * 4),
});
export type SessionAttachmentInput = z.infer<typeof sessionAttachmentInputSchema>;
export const sessionAttachmentContract = {
  status: oc
    .meta(exposeApiTo("renderer"))
    .input(z.strictObject({}))
    .output(z.object({ enabled: z.boolean() })),
  upload: oc
    .meta(exposeApiTo("renderer"))
    .input(sessionAttachmentInputSchema)
    .output(
      z.object({
        id: z.uuid(),
        revision: z.literal(1),
        attachment: z.string(),
      }),
    ),
};
