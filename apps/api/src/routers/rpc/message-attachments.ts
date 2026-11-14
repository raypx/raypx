import { ORPCError } from "@orpc/server";
import { MessageAttachmentError } from "@raypx/agents/server";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { RpcSetup } from "./setup.js";

export function createMessageAttachmentsHandlers(setup: RpcSetup) {
  const { os, options, withRpcPermission, requireTrustedOrigin, limitAccount } = setup;
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 120 });
  async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof MessageAttachmentError)
        throw new ORPCError("BAD_REQUEST", { data: { error: { code: error.code } } });
      throw error;
    }
  }
  return {
    upload: os.messageAttachments.upload
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        call(async () =>
          options.messageAttachments.upload(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.conversationId,
            input,
          ),
        ),
      ),
    remove: os.messageAttachments.remove
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        call(async () =>
          options.messageAttachments.remove(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.conversationId,
            input.id,
          ),
        ),
      ),
    download: os.messageAttachments.download
      .use(read)
      .handler(({ context, input }) =>
        call(async () =>
          options.messageAttachments.download(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.conversationId,
            input.id,
          ),
        ),
      ),
  };
}
