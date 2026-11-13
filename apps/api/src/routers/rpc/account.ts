import { createAccountService } from "@raypx/account/server";
import { ORPCError } from "@orpc/server";
import type { RpcBoundary } from "./boundary.js";
export function createAccountHandlers({
  os,
  options,
  access,
  withRpcPermission,
  withPublicRpcAccess,
}: Pick<RpcBoundary, "os" | "options" | "access" | "withRpcPermission" | "withPublicRpcAccess">) {
  return {
    access: os.account.access
      .use(withPublicRpcAccess)
      .handler(async ({ context }) => access(await options.readSession(context.headers))),
    get: os.account.get.use(withRpcPermission()).handler(async ({ context }) => {
      // The middleware already resolved this request's session; project it without a second read.
      const account = await createAccountService({ readSession: async () => context.auth }).get(
        context.headers,
      );
      if (!account)
        throw new ORPCError("UNAUTHORIZED", {
          data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
        });
      return account;
    }),
  };
}
