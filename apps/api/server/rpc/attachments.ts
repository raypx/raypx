import { ORPCError } from "@orpc/server";
import { AttachmentError } from "../storage/types.js";
import { ControlError } from "@raypx/control";
import type { RpcBoundary } from "./boundary.js";

export function createAttachmentHandlers({
  os,
  options,
  allowedOrigins,
  requirePermission,
}: Pick<RpcBoundary, "os" | "options" | "allowedOrigins" | "requirePermission">) {
  return {
    status: os.attachments.status.handler(async ({ context }) => {
      await requirePermission(context, "tasks.read");
      try {
        return { enabled: (await options.attachments?.enabled()) ?? false };
      } catch {
        throw new ORPCError("SERVICE_UNAVAILABLE");
      }
    }),
    upload: os.attachments.upload.handler(async ({ context, input }) => {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin)) throw new ORPCError("FORBIDDEN");
      const auth = await requirePermission(context, "tasks.read", "attachments.upload");
      try {
        if (!options.attachments) throw new AttachmentError("STORAGE_UNAVAILABLE");
        return await options.attachments.upload(auth.user.id, input);
      } catch (error) {
        const code =
          error instanceof AttachmentError
            ? error.code
            : error instanceof ControlError
              ? "CONTEXT_PROJECT_MISMATCH"
              : "STORAGE_UNAVAILABLE";
        const status =
          code === "ATTACHMENT_LIMIT"
            ? "TOO_MANY_REQUESTS"
            : code === "STORAGE_UNAVAILABLE"
              ? "SERVICE_UNAVAILABLE"
              : "BAD_REQUEST";
        throw new ORPCError(status, {
          data: { error: { code }, requestId: context.requestId },
        });
      }
    }),
  };
}
