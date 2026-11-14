import { ORPCError } from "@orpc/server";
import { ProtectedInputError } from "@raypx/agents/server";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { RpcSetup } from "./setup.js";

export function createProtectedInputHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function perform<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof SpaceNotFound ||
        (error instanceof ProtectedInputError && error.code === "NOT_FOUND")
      )
        throw new ORPCError("NOT_FOUND");
      if (error instanceof ProtectedInputError)
        throw new ORPCError(error.code === "UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : "CONFLICT", {
          message: "PROTECTED_INPUT_UNAVAILABLE",
        });
      // Driver/crypto errors must never reach transport diagnostics.
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "PROTECTED_INPUT_UNAVAILABLE" });
    }
  }
  return {
    pending: os.protectedInputs.pending
      .use(withRpcPermission({ window: 60, max: 120 }))
      .handler(({ context, input }) =>
        perform(async () =>
          options.protectedInputs.pending(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
          ),
        ),
      ),
    answer: os.protectedInputs.answer
      .use(withRpcPermission())
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 30 }))
      .handler(({ context, input }) =>
        perform(async () =>
          options.protectedInputs.answer(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.requestId,
            input.answer,
          ),
        ),
      ),
  };
}
