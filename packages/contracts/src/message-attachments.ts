import { oc } from "@orpc/contract";
import { z } from "zod";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import {
  attachmentIdSchema,
  attachmentNameSchema,
  attachmentMediaTypeSchema,
  messageAttachmentSchema,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_CHUNK_BYTES,
} from "@raypx/core/conversation";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema, conversationId: conversationIdSchema });
export const messageAttachmentUploadSchema = selection.extend({
  name: attachmentNameSchema,
  mediaType: attachmentMediaTypeSchema,
  bytes: z
    .base64()
    .min(4)
    .max((MESSAGE_ATTACHMENT_CHUNK_BYTES / 3) * 4),
  uploadId: attachmentIdSchema.optional(),
  offset: z.number().int().min(0).max(MAX_MESSAGE_ATTACHMENT_BYTES).optional(),
  totalSize: z.number().int().min(1).max(MAX_MESSAGE_ATTACHMENT_BYTES).optional(),
  final: z.boolean().optional(),
});
export const messageAttachmentsContract = {
  upload: session.input(messageAttachmentUploadSchema).output(messageAttachmentSchema),
  remove: session
    .input(selection.extend({ id: attachmentIdSchema }))
    .output(z.strictObject({ ok: z.literal(true) })),
  download: session.input(selection.extend({ id: attachmentIdSchema })).output(
    z.strictObject({
      attachment: messageAttachmentSchema,
      bytes: z
        .base64()
        .min(4)
        .max(Math.ceil(MAX_MESSAGE_ATTACHMENT_BYTES / 3) * 4),
    }),
  ),
};
