import { ORPCError } from "@orpc/server";
import { ModelConnectionError } from "../../conversations/connections.js";
import type { RpcSetup } from "./setup.js";

export function createModelConnectionsHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  async function perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ModelConnectionError) {
        const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST";
        throw new ORPCError(code, { message: error.code, data: { error: { code: error.code } } });
      }
      // Never expose a database/crypto/provider cause, which may contain sensitive values.
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "CONNECTION_OPERATION_FAILED" });
    }
  }
  return {
    list: os.modelConnections.list
      .use(read)
      .handler(({ context }) => perform(() => options.modelConnections.list(context.auth.user.id))),
    create: os.modelConnections.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() =>
          options.modelConnections.create(context.auth.user.id, input.connection, input.secret),
        ),
      ),
    update: os.modelConnections.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() =>
          options.modelConnections.update(
            context.auth.user.id,
            input.id,
            input.connection,
            input.secret,
          ),
        ),
      ),
    delete: os.modelConnections.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() => options.modelConnections.delete(context.auth.user.id, input.id)),
      ),
    test: os.modelConnections.test
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() => options.modelConnections.test(context.auth.user.id, input.id, input.model)),
      ),
  };
}
