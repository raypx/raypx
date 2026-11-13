import { ORPCError } from "@orpc/server";
import { ContextError } from "@raypx/core/memory";
import type { ContextLibraryService } from "@raypx/memory/server";
import type { AccountRateLimit, RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createMemoryHandlers({
  os,
  options,
  requirePermission,
  checkTrustedOrigin,
  enforceAccountLimit,
}: Pick<
  RpcBoundary,
  "os" | "options" | "requirePermission" | "checkTrustedOrigin" | "enforceAccountLimit"
>) {
  async function memoryCall<T>(
    context: RpcContext,
    limit: AccountRateLimit,
    write: boolean,
    run: (service: ContextLibraryService, owner: string) => Promise<T>,
  ) {
    const auth = await requirePermission(context, "memory.manage");
    if (write) checkTrustedOrigin(context);
    await enforceAccountLimit(context, auth, limit);
    if (!options.memory) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.memory, auth.user.id);
    } catch (error) {
      if (!(error instanceof ContextError)) throw error;
      const code =
        error.code === "CONTEXT_NOT_FOUND"
          ? "NOT_FOUND"
          : ["INVALID_CONTEXT", "CONTEXT_TOO_LARGE"].includes(error.code)
            ? "BAD_REQUEST"
            : error.code === "AUTH_REQUIRED"
              ? "UNAUTHORIZED"
              : error.code === "CONTEXT_UNAVAILABLE"
                ? "SERVICE_UNAVAILABLE"
                : "CONFLICT";
      throw new ORPCError(code, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }

  return {
    list: os.memory.list.handler(({ context }) =>
      memoryCall(
        context,
        { procedure: "memory.list", window: 60, max: 60 },
        false,
        (service, owner) => service.list(owner),
      ),
    ),
    get: os.memory.get.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.get", window: 60, max: 60 },
        false,
        (service, owner) => service.get(owner, input),
      ),
    ),
    create: os.memory.create.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.create", window: 60, max: 20 },
        true,
        (service, owner) => service.create(owner, input),
      ),
    ),
    update: os.memory.update.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.update", window: 60, max: 30 },
        true,
        (service, owner) => service.update(owner, input),
      ),
    ),
    archive: os.memory.archive.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.archive", window: 60, max: 20 },
        true,
        (service, owner) => service.archive(owner, input),
      ),
    ),
    history: os.memory.history.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.history", window: 60, max: 60 },
        false,
        (service, owner) => service.history(owner, input),
      ),
    ),
    delete: os.memory.delete.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.delete", window: 60, max: 20 },
        true,
        (service, owner) => service.delete(owner, input),
      ),
    ),
    restore: os.memory.restore.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.restore", window: 60, max: 20 },
        true,
        (service, owner) => service.restore(owner, input),
      ),
    ),
    resolve: os.memory.resolve.handler(({ context, input }) =>
      memoryCall(
        context,
        { procedure: "memory.resolve", window: 60, max: 30 },
        false,
        (service, owner) =>
          options.resolveContext
            ? options.resolveContext(owner, input.selection, input.target, input.prompt ?? " ")
            : service.resolve(owner, input.selection, input.target, input.prompt ?? " "),
      ),
    ),
  };
}
