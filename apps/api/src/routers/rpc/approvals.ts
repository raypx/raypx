import type { RpcSetup } from "./setup.js";
import { ApprovalOperationError, ApprovalSettingsConflictError } from "@raypx/agents/server";
import { SpaceMutationError, SpaceNotFound } from "@raypx/core/spaces";
import type { AccountContext } from "../../middleware/rpc.js";
import { ORPCError } from "@orpc/server";
export function createApprovalsHandlers({
  os,
  callControl,
  withRpcPermission,
  options,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function perform<T>(context: AccountContext, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SpaceMutationError && error.code === "SPACE_AUDIT_UNAVAILABLE")
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof ApprovalSettingsConflictError)
        throw new ORPCError("CONFLICT", {
          message: error.code,
          data: { code: error.code, settings: error.settings },
        });
      if (error instanceof ApprovalOperationError) {
        if (error.code === "MODE_UNAVAILABLE")
          throw new ORPCError("BAD_REQUEST", {
            message: "APPROVAL_MODE_UNAVAILABLE",
            data: { reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
          });
        if (error.code === "NOT_FOUND" || error.code === "NOT_ADDRESSED")
          throw new ORPCError("NOT_FOUND");
        throw new ORPCError("CONFLICT", { message: error.code });
      }
      throw error;
    }
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  return {
    effectiveMode: os.approvals.effectiveMode
      .use(read)
      .handler(({ context, input }) =>
        perform(context, async () =>
          options.agentApprovals.getEffectiveMode(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
          ),
        ),
      ),
    pending: os.approvals.pending
      .use(read)
      .handler(({ context, input }) =>
        perform(context, async () =>
          options.agentApprovals.listPending(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
          ),
        ),
      ),
    answer: os.approvals.answer
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(context, async () =>
          options.agentApprovals.answer(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.requestId,
            {
              decision: input.decision,
              ...(input.allowTool !== undefined ? { allowTool: input.allowTool } : {}),
            },
          ),
        ),
      ),
    settings: os.approvals.settings
      .use(read)
      .handler(({ context }) =>
        perform(context, () => options.agentApprovals.getSettings(context.auth.user.id)),
      ),
    updateSettings: os.approvals.updateSettings
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(context, () => options.agentApprovals.updateSettings(context.auth.user.id, input)),
      ),
    effects: os.approvals.effects
      .use(read)
      .handler(({ context, input }) =>
        perform(context, async () =>
          options.agentApprovals.listEffects(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.runId,
          ),
        ),
      ),
    list: os.approvals.list
      .use(withRpcPermission())
      .handler(({ context }) =>
        callControl(context, (control, auth) => control.tasks.listApprovals(auth.user.id)),
      ),
  };
}
