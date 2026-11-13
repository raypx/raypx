import {
  COMMON_ERROR_STATUS_MAP,
  DEFAULT_ERROR_STATUS,
  implement,
  ORPCError,
  type AnyProcedure,
} from "@orpc/server";
import has from "lodash-es/has.js";
import { apiContract, getRpcAccess, getRpcAudit } from "@raypx/contracts/api";
import { AuditUnavailable } from "../admin/audit.js";
import { hasPermission, type AccountPermission } from "@raypx/account/access";
import type { AuthSession } from "@raypx/core/auth";
import type { AccessPolicy } from "../access.js";
import type { ApiAppOptions } from "../app/options.js";
import type { RateRule } from "../rate-limit/types.js";

export type RpcContext = { headers: Headers; requestId: string };

export type AccountContext = RpcContext & { auth: AuthSession };

const accessMiddlewares = new WeakSet();
function enforcing<T extends object>(middleware: T): T {
  accessMiddlewares.add(middleware);
  return middleware;
}
/** True when a procedure runs one of the middleware that enforce its declared access. */
export function enforcesRpcAccess(procedure: AnyProcedure): boolean {
  return procedure["~orpc"].orderedMiddlewares.some(({ middleware }) =>
    accessMiddlewares.has(middleware),
  );
}

/** The HTTP status oRPC answers with for a thrown error. */
function errorStatus(error: unknown): number {
  if (!(error instanceof ORPCError)) return 500;
  const statuses: Readonly<Record<string, number>> = COMMON_ERROR_STATUS_MAP;
  return statuses[error.code] ?? DEFAULT_ERROR_STATUS;
}

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
  { readSession, rateLimit, audit }: Pick<ApiAppOptions, "readSession" | "rateLimit" | "audit">,
  access: AccessPolicy,
  allowedOrigins: string[],
) {
  const implementer = implement(apiContract).$context<RpcContext>();
  // One resolution per request: the audit scope and the access check see the same session.
  const sessions = new WeakMap<Headers, Promise<AuthSession | null>>();
  function sessionOf({ headers }: RpcContext) {
    let session = sessions.get(headers);
    if (!session) sessions.set(headers, (session = readSession(headers)));
    return session;
  }
  const os = implementer
    // Runs before input validation and every other check, so an identified caller's
    // refusals are recorded too. The contract declares which procedures are audited.
    .use(async ({ context, next, procedure }) => {
      const action = getRpcAudit(procedure);
      if (!action || !audit) return next();
      const session = await sessionOf(context);
      if (!session) return next();
      const actorId = session.user.id;
      await enforceLimit(context, `admin.audit:${actorId}`, { window: 60, max: 60 });
      type Result = Awaited<ReturnType<typeof next>>;
      let failure: { error: unknown } | undefined;
      let result: Result | Response;
      try {
        result = await audit.run(
          { action, actorId, source: "http", requestId: context.requestId },
          async () => {
            try {
              return await next();
            } catch (error) {
              // The audit service classifies a failed request by its HTTP status.
              failure = { error };
              return new Response(null, { status: errorStatus(error) });
            }
          },
        );
      } catch (error) {
        if (!(error instanceof AuditUnavailable)) throw error;
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "Administration audit is unavailable",
          data: { error: { code: "AUDIT_UNAVAILABLE" }, requestId: context.requestId },
        });
      }
      if (failure) throw failure.error;
      return result as Result;
    })
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
  async function requireAccount(context: RpcContext, policy: "session" | AccountPermission) {
    const auth = await sessionOf(context);
    if (!auth)
      throw new ORPCError("UNAUTHORIZED", {
        data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
      });
    if (policy !== "session" && !hasPermission(access(auth), policy))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "FORBIDDEN" }, requestId: context.requestId },
      });
    return auth;
  }
  /** One window per account and procedure; the key is the contract path. */
  function enforceAccountLimit(context: AccountContext, path: readonly string[], rule: RateRule) {
    return enforceLimit(context, `rpc:${context.auth.user.id}:${path.join(".")}`, rule);
  }
  /** Resolves the session and enforces the access declared on the contract procedure. */
  function withRpcPermission(limit?: RateRule) {
    return enforcing(
      implementer.middleware(async ({ context, next, procedure, path }) => {
        const policy = getRpcAccess(procedure);
        if (policy === undefined || policy === "public") throw new ORPCError("FORBIDDEN");
        const account = { ...context, auth: await requireAccount(context, policy) };
        if (limit) await enforceAccountLimit(account, path, limit);
        return next({ context: { auth: account.auth } });
      }),
    );
  }
  const withPublicRpcAccess = enforcing(
    implementer.middleware(({ procedure, next }) => {
      if (getRpcAccess(procedure) !== "public") throw new ORPCError("FORBIDDEN");
      return next();
    }),
  );
  /** For a quota that must follow another check, such as the trusted Origin. */
  function limitAccount(rule: RateRule) {
    return implementer.$context<AccountContext>().middleware(async ({ context, next, path }) => {
      await enforceAccountLimit(context, path, rule);
      return next();
    });
  }
  const requireTrustedOrigin = implementer.middleware(function trustedOrigin({ context, next }) {
    const origin = context.headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
      });
    return next();
  });
  return {
    /** Assembles the served router; `os` procedures already carry the shared middleware. */
    implementer,
    os,
    enforceLimit,
    withRpcPermission,
    withPublicRpcAccess,
    limitAccount,
    requireTrustedOrigin,
  };
}
