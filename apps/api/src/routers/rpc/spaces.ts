import { ComputerFilesError, ComputerOperationError } from "@raypx/computers/server";
import { GroupConversationError } from "@raypx/core/agents";
import { ConversationSteeringError, InvalidConversationCursor } from "@raypx/core/conversation";
import { ORPCError } from "@orpc/server";
import { SpaceMutationError, SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createSpaceHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function call<T>(context: AccountContext, run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ConversationSteeringError)
        throw new ORPCError("CONFLICT", {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      if (error instanceof GroupConversationError)
        throw new ORPCError("BAD_REQUEST", {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      if (error instanceof SpaceMutationError) {
        const status = {
          SPACE_OWNER_REQUIRED: "FORBIDDEN",
          SPACE_LAST_OWNER: "CONFLICT",
          SPACE_LAST_PRIVATE: "CONFLICT",
          INVITATION_NOT_FOUND: "NOT_FOUND",
          INVITATION_EXPIRED: "GONE",
          INVITATION_CANCELLED: "GONE",
          INVITATION_CONSUMED: "CONFLICT",
          SPACE_AUDIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
          INVALID_AUDIT_CURSOR: "BAD_REQUEST",
          REVIEW_MODEL_NOT_CONFIGURED: "BAD_REQUEST",
        } as const;
        throw new ORPCError(status[error.code], {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      }
      if (error instanceof ComputerFilesError)
        throw new ORPCError(error.code === "FILE_NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      if (error instanceof ComputerOperationError)
        throw new ORPCError("CONFLICT", { message: error.code });
      if (error instanceof InvalidConversationCursor) throw new ORPCError("BAD_REQUEST");
      if (!(error instanceof SpaceNotFound)) throw error;
      throw new ORPCError("NOT_FOUND", {
        data: { error: { code: "NOT_FOUND" }, requestId: context.requestId },
      });
    }
  }
  function scoped<T>(
    context: AccountContext,
    requested: SpaceId,
    run: (scope: SpaceScope) => Promise<T>,
  ) {
    return call(context, async () =>
      run(await options.spaces.resolve(context.auth.user.id, requested)),
    );
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  const invitationCreateQuota = limitAccount({ window: 60, max: 10 });
  const invitationAcceptQuota = limitAccount({ window: 60, max: 20 });
  return {
    computers: {
      get: os.computers.get
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.get(scope)),
        ),
      listDirectory: os.computers.listDirectory
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.computers.listDirectory(scope, input.path, input.limit),
          ),
        ),
      readFile: os.computers.readFile
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.computers.readFile(scope, input.path, input.maxBytes),
          ),
        ),
      start: os.computers.start
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.start(scope)),
        ),
      stop: os.computers.stop
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.stop(scope)),
        ),
    },
    conversations: {
      createGroup: os.conversations.createGroup
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        // The repository validates the group strictly; the Space selector is not part of it.
        .handler(({ context, input: { spaceId, ...group } }) =>
          scoped(context, spaceId, (scope) => options.conversations.createGroup!(scope, group)),
        ),
      listGroups: os.conversations.listGroups
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.listGroups!(scope, input.limit),
          ),
        ),
      getGroup: os.conversations.getGroup
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.getGroup!(scope, input.conversationId),
          ),
        ),
      renameGroup: os.conversations.renameGroup
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.renameGroup!(scope, input.conversationId, input.name),
          ),
        ),
      addGroupAgent: os.conversations.addGroupAgent
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.addGroupAgent!(scope, input.conversationId, input.agentId),
          ),
        ),
      removeGroupAgent: os.conversations.removeGroupAgent
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.removeGroupAgent!(scope, input.conversationId, input.agentId),
          ),
        ),
      setGroupDefaultResponder: os.conversations.setGroupDefaultResponder
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.setGroupDefaultResponder!(
              scope,
              input.conversationId,
              input.agentId,
            ),
          ),
        ),
      deleteGroup: os.conversations.deleteGroup
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.deleteGroup!(scope, input.conversationId),
          ),
        ),
      stop: os.conversations.stop
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.stop(scope, input.conversationId, input.runId),
          ),
        ),
      send: os.conversations.send
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.send(scope, input.conversationId, input.message),
          ),
        ),
      events: os.conversations.events
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.events(scope, input.conversationId, input.after, input.limit),
          ),
        ),
      history: os.conversations.history
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.history!(scope, input.conversationId, input.limit, input.before),
          ),
        ),
      snapshot: os.conversations.snapshot
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.snapshot(scope, input.conversationId),
          ),
        ),
    },
    spaces: {
      get: os.spaces.get
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.get(scope)),
        ),
      rename: os.spaces.rename
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.rename(scope, { name: input.name }),
          ),
        ),
      delete: os.spaces.delete
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.delete(scope)),
        ),
      leave: os.spaces.leave
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.leave(scope)),
        ),
      members: os.spaces.members
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.members(scope)),
        ),
      updateMemberRole: os.spaces.updateMemberRole
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.updateMemberRole(scope, input.accountId, input.role),
          ),
        ),
      removeMember: os.spaces.removeMember
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.removeMember(scope, input.accountId),
          ),
        ),
      invitations: os.spaces.invitations
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.invitations(scope)),
        ),
      createInvitation: os.spaces.createInvitation
        .use(write)
        .use(requireTrustedOrigin)
        .use(invitationCreateQuota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.createInvitation(scope),
          ),
        ),
      cancelInvitation: os.spaces.cancelInvitation
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.cancelInvitation(scope, input.id),
          ),
        ),
      cancelInvitations: os.spaces.cancelInvitations
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.cancelInvitations(scope),
          ),
        ),
      previewInvitation: os.spaces.previewInvitation
        .use(withRpcPermission({ window: 60, max: 30 }))
        .handler(({ context, input }) =>
          call(context, () =>
            options.spaceManagement.previewInvitation(context.auth.user.id, input.token),
          ),
        ),
      acceptInvitation: os.spaces.acceptInvitation
        .use(write)
        .use(requireTrustedOrigin)
        .use(invitationAcceptQuota)
        .handler(({ context, input }) =>
          call(context, () =>
            options.spaceManagement.acceptInvitation(context.auth.user.id, input.token),
          ),
        ),
      settings: os.spaces.settings
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.spaceManagement.settings(scope)),
        ),
      setApprovalOverride: os.spaces.setApprovalOverride
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.setApprovalOverride(scope, input.mode),
          ),
        ),
      clearApprovalOverride: os.spaces.clearApprovalOverride
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.clearApprovalOverride(scope),
          ),
        ),
      audit: os.spaces.audit
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.audit(scope, input.cursor, input.limit),
          ),
        ),
      events: os.spaces.events
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.spaceManagement.events(scope, input.after, input.limit),
          ),
        ),
      list: os.spaces.list
        .use(read)
        .handler(({ context }) => call(context, () => options.spaces.list(context.auth.user.id))),
      create: os.spaces.create
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          call(context, () => options.spaces.create(context.auth.user.id, input)),
        ),
    },
    agents: {
      models: os.agents.models
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.conversationModels.list(scope)),
        ),
      list: os.agents.list
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.list(scope, input.limit)),
        ),
      get: os.agents.get
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.get(scope, input.id)),
        ),
      create: os.agents.create
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.create(scope, input.agent)),
        ),
      update: os.agents.update
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.agents.update(scope, input.id, input.agent),
          ),
        ),
      delete: os.agents.delete
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.delete(scope, input.id)),
        ),
    },
  };
}
