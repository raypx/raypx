import { ORPCError } from "@orpc/server";
import { ContextError } from "@raypx/core/memory";
import type { ContextLibraryService } from "@raypx/memory/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

type Status = "NOT_FOUND" | "BAD_REQUEST" | "UNAUTHORIZED" | "SERVICE_UNAVAILABLE";
const statuses: Readonly<Record<string, Status>> = {
  CONTEXT_NOT_FOUND: "NOT_FOUND",
  INVALID_CONTEXT: "BAD_REQUEST",
  CONTEXT_TOO_LARGE: "BAD_REQUEST",
  AUTH_REQUIRED: "UNAUTHORIZED",
  CONTEXT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
};

export function createMemoryHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: Pick<
  RpcSetup,
  "os" | "options" | "withRpcPermission" | "requireTrustedOrigin" | "limitAccount"
>) {
  async function memoryCall<T>(
    context: AccountContext,
    run: (service: ContextLibraryService, owner: string) => Promise<T>,
  ) {
    try {
      return await run(options.memory, context.auth.user.id);
    } catch (error) {
      if (!(error instanceof ContextError)) throw error;
      throw new ORPCError(statuses[error.code] ?? "CONFLICT", {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  // Writes reject an untrusted Origin before they spend the account's quota.
  const canManage = withRpcPermission();

  return {
    list: os.memory.list
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context }) => memoryCall(context, (service, owner) => service.list(owner))),
    get: os.memory.get
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.get(owner, input)),
      ),
    create: os.memory.create
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 20 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.create(owner, input)),
      ),
    update: os.memory.update
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 30 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.update(owner, input)),
      ),
    archive: os.memory.archive
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 20 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.archive(owner, input)),
      ),
    history: os.memory.history
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.history(owner, input)),
      ),
    delete: os.memory.delete
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 20 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.delete(owner, input)),
      ),
    restore: os.memory.restore
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 20 }))
      .handler(({ context, input }) =>
        memoryCall(context, (service, owner) => service.restore(owner, input)),
      ),
    resolve: os.memory.resolve
      .use(withRpcPermission({ window: 60, max: 30 }))
      .handler(({ context, input }) =>
        memoryCall(context, (_, owner) =>
          options.resolveContext(owner, input.selection, input.target, input.prompt ?? " "),
        ),
      ),
  };
}
