import { ORPCError } from "@orpc/server";
import { AttachmentError } from "../../storage/types.js";
import { ControlError } from "@raypx/control";
import type { RpcBoundary } from "./boundary.js";

type Status = "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE";
const statuses: Readonly<Record<string, Status>> = {
  ATTACHMENT_LIMIT: "TOO_MANY_REQUESTS",
  STORAGE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
};
function failureCode(error: unknown) {
  if (error instanceof AttachmentError) return error.code;
  return error instanceof ControlError ? "CONTEXT_PROJECT_MISMATCH" : "STORAGE_UNAVAILABLE";
}

export function createAttachmentHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
}: Pick<RpcBoundary, "os" | "options" | "withRpcPermission" | "requireTrustedOrigin">) {
  return {
    status: os.attachments.status.use(withRpcPermission()).handler(async () => {
      try {
        return { enabled: (await options.attachments?.enabled()) ?? false };
      } catch {
        throw new ORPCError("SERVICE_UNAVAILABLE");
      }
    }),
    upload: os.attachments.upload
      .use(requireTrustedOrigin)
      .use(withRpcPermission({ window: 60, max: 10 }))
      .handler(async ({ context, input }) => {
        try {
          if (!options.attachments) throw new AttachmentError("STORAGE_UNAVAILABLE");
          return await options.attachments.upload(context.auth.user.id, input);
        } catch (error) {
          const code = failureCode(error);
          throw new ORPCError(statuses[code] ?? "BAD_REQUEST", {
            data: { error: { code }, requestId: context.requestId },
          });
        }
      }),
  };
}
