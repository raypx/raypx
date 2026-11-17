import { browserAcceptedSchema, browserViewSchema, type BrowserCommand } from "@raypx/core/browser";
import type { AccountContext } from "../../middleware/rpc.js";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { ConversationId } from "@raypx/core/agents";
import { BrowserError } from "@raypx/providers/browser";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { RpcSetup } from "./setup.js";

const result = z.union([browserViewSchema, browserAcceptedSchema]);

export function createBrowserHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function invoke<T>(
    context: AccountContext,
    input: { spaceId: SpaceId; conversationId: ConversationId },
    command: BrowserCommand,
    schema: z.ZodType<T>,
  ) {
    try {
      const scope = await options.spaces.resolve(context.auth.user.id, input.spaceId);
      if (!options.browser || !options.conversations.assertConversation)
        throw new BrowserError("BROWSER_UNAVAILABLE");
      await options.conversations.assertConversation(scope, input.conversationId);
      return await options.browser.request(
        {
          spaceId: scope.spaceId,
          conversationId: input.conversationId,
          accountId: scope.member.accountId,
        },
        command,
        schema,
      );
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof BrowserError) {
        if (error.message === "BROWSER_UNAVAILABLE") throw new ORPCError("SERVICE_UNAVAILABLE");
        throw new ORPCError("CONFLICT", {
          data: { error: { code: error.message }, requestId: context.requestId },
        });
      }
      throw error;
    }
  }
  const read = withRpcPermission({ window: 60, max: 150 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 240 });
  return {
    view: os.browsers.view
      .use(read)
      .use(requireTrustedOrigin)
      .handler(({ context, input }) =>
        options.browser
          ? invoke(
              context,
              input,
              { op: "view", ...(input.token ? { token: input.token } : {}) },
              browserViewSchema,
            )
          : { state: "unavailable" as const },
      ),
    command: os.browsers.command
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) => invoke(context, input, input.command, result)),
  };
}
