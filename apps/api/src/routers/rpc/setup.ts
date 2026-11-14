import { normalizeTrustedOrigins } from "@raypx/core/auth";
import { createAccessPolicy } from "../../access.js";
import type { ApiAppOptions } from "../../app/options.js";
import { createRpcMiddleware } from "../../middleware/rpc.js";

export function createRpcSetup(options: ApiAppOptions) {
  const access = options.access ?? createAccessPolicy();
  const allowedOrigins = normalizeTrustedOrigins(options.allowedOrigins);
  const middleware = createRpcMiddleware(options, access, allowedOrigins);

  return {
    ...middleware,
    options,
    access,
  };
}

export type RpcSetup = ReturnType<typeof createRpcSetup>;
