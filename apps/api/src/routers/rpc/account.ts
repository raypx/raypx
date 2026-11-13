import { createAccountService } from "@raypx/account/server";
import { ORPCError } from "@orpc/server";
import type { RpcBoundary } from "./boundary.js";
export function createAccountHandlers({
  os,
  options,
  access,
}: Pick<RpcBoundary, "os" | "options" | "access">) {
  const accountService = createAccountService({
    readSession: (headers) => options.readSession(headers),
  });

  return {
    access: os.account.access.handler(async ({ context }) =>
      access(await options.readSession(context.headers)),
    ),
    get: os.account.get.handler(async ({ context }) => {
      const account = await accountService.get(context.headers);
      if (!account)
        throw new ORPCError("UNAUTHORIZED", {
          data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
        });
      return account;
    }),
  };
}
