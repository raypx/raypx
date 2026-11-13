import { implement, ORPCError } from "@orpc/server";
import has from "lodash-es/has.js";
import { apiContract, getRpcAccess } from "@raypx/contracts/api";
import { hasPermission, type AccountPermission } from "@raypx/account/access";
import type { AuthSession } from "@raypx/core/auth";
import type { AccessPolicy } from "../access.js";
import type { ApiAppOptions } from "../app/options.js";
import type { RateRule } from "../rate-limit/types.js";

export type RpcContext = { headers: Headers; requestId: string };

export type AccountRateLimit = RateRule & { procedure: string };

/** True when decoded input carries keys that merge or path-set helpers could abuse. */
function hasPollutingKey(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (has(item, ["__proto__"]) || has(item, ["constructor", "prototype"])) return true;
    pending.push(...Object.values(item));
  }
  return false;
}

export function createRpcMiddleware(
  { readSession, rateLimit }: Pick<ApiAppOptions, "readSession" | "rateLimit">,
  access: AccessPolicy,
  allowedOrigins: string[],
) {
  const implementer = implement(apiContract).$context<RpcContext>();
  const os = implementer
    // TimeoutHandlerPlugin only aborts the signal; database calls do not observe it,
    // so answer as soon as it fires instead of waiting for them.
    // oRPC's own decoding never assigns through prototypes; this keeps such keys away
    // from application code that might merge or clone input with a vulnerable helper.
    .use(({ next, context }, input) => {
      if (hasPollutingKey(input))
        throw new ORPCError("BAD_REQUEST", {
          data: { error: { code: "INVALID_INPUT" }, requestId: context.requestId },
        });
      return next();
    })
    .use(({ next, signal, context }) => {
      if (!signal) return next();
      return Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          const fail = () =>
            reject(
              new ORPCError("SERVICE_UNAVAILABLE", {
                data: { error: { code: "REQUEST_TIMEOUT" }, requestId: context.requestId },
              }),
            );
          if (signal.aborted) fail();
          else signal.addEventListener("abort", fail, { once: true });
        }),
      ]);
    });
  async function enforceLimit(context: RpcContext, key: string, rule: RateRule) {
    if (rateLimit && !(await rateLimit(key, rule)))
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { error: { code: "RATE_LIMITED" }, requestId: context.requestId },
      });
  }
  async function requirePermission(
    context: RpcContext,
    permission: AccountPermission,
    limit?: AccountRateLimit,
  ) {
    const auth = await readSession(context.headers);
    if (!auth)
      throw new ORPCError("UNAUTHORIZED", {
        data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
      });
    if (!hasPermission(access(auth), permission))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "FORBIDDEN" }, requestId: context.requestId },
      });
    if (limit) await enforceAccountLimit(context, auth, limit);
    return auth;
  }
  function enforceAccountLimit(
    context: RpcContext,
    auth: AuthSession,
    { procedure, window, max }: AccountRateLimit,
  ) {
    return enforceLimit(context, `rpc:${auth.user.id}:${procedure}`, { window, max });
  }
  function withRpcPermission(limit?: AccountRateLimit) {
    return implementer.middleware(async ({ context, next, procedure }) => {
      const permission = getRpcAccess(procedure);
      if (permission === undefined || permission === "public") throw new ORPCError("FORBIDDEN");
      const auth = await requirePermission(context, permission, limit);
      return next({ context: { auth } });
    });
  }
  const withPublicRpcAccess = implementer.middleware(({ procedure, next }) => {
    if (getRpcAccess(procedure) !== "public") throw new ORPCError("FORBIDDEN");
    return next();
  });
  function checkTrustedOrigin(context: RpcContext) {
    const origin = context.headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
      });
  }
  const requireTrustedOrigin = implementer.middleware(function trustedOrigin({ context, next }) {
    checkTrustedOrigin(context);
    return next();
  });
  return {
    os,
    enforceLimit,
    enforceAccountLimit,
    requirePermission,
    withRpcPermission,
    withPublicRpcAccess,
    checkTrustedOrigin,
    requireTrustedOrigin,
  };
}
