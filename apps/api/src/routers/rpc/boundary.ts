import { ORPCError } from "@orpc/server";
import { ControlError, type ControlService } from "@raypx/control";
import { normalizeTrustedOrigins, type AuthSession } from "@raypx/core/auth";
import { createAccessPolicy } from "../../access.js";
import type { ApiAppOptions } from "../../app/options.js";
import { createRpcMiddleware, type AccountContext, type RpcContext } from "../../middleware/rpc.js";

function controlFailure(error: unknown, context: RpcContext): never {
  if (!(error instanceof ControlError)) throw error;
  let code: "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT" = "CONFLICT";
  switch (error.code) {
    case "AUTH_REQUIRED":
    case "DEVICE_REVOKED":
      code = "UNAUTHORIZED";
      break;
    case "NOT_FOUND":
      code = "NOT_FOUND";
      break;
  }
  throw new ORPCError(code, {
    data: { error: { code: error.code }, requestId: context.requestId },
  });
}

export function createRpcBoundary(options: ApiAppOptions) {
  const access = options.access ?? createAccessPolicy();
  const allowedOrigins = normalizeTrustedOrigins(options.allowedOrigins);
  const middleware = createRpcMiddleware(options, access, allowedOrigins);

  async function controlCall<T>(
    context: AccountContext,
    run: (control: ControlService, auth: AuthSession) => Promise<T>,
  ) {
    try {
      return await run(options.control, context.auth);
    } catch (error) {
      return controlFailure(error, context);
    }
  }

  return {
    ...middleware,
    controlCall,
    options,
    controlFailure,
    access,
  };
}

export type RpcBoundary = ReturnType<typeof createRpcBoundary>;
