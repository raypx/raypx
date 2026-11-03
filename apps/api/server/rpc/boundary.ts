import { implement, ORPCError } from "@orpc/server";
import { apiContract } from "@raypx/contracts/api";
import type { ApiAppOptions } from "../app/options.js";
import { ControlError, type ControlService } from "@raypx/control";
import { ConfigurationError } from "../configuration/service.js";
import type { ConfigurationService } from "../configuration/types.js";
import type { AuthSession } from "@raypx/auth/types";
import { hasPermission, type AccountPermission } from "@raypx/account/access";
import { createAccessPolicy } from "../access.js";
import { normalizeTrustedOrigins } from "@raypx/auth/origins";
import { createAccountService } from "@raypx/account/server";
import type { RateRule } from "../rate-limit/types.js";
import type { CloudJobsService } from "@raypx/jobs/server";
import { JobError } from "@raypx/jobs";
import { ContextError } from "@raypx/memory";
import type { ContextLibraryService } from "@raypx/memory/server";
import type { InstanceService } from "@raypx/instances/server";
import { InstanceError } from "@raypx/instances";
// Per-account limits for procedures that create grants, devices or relay tickets.
const rpcLimits = {
  "devices.register": { window: 60, max: 10 },
  "devices.refreshGrant": { window: 60, max: 30 },
  "hosts.authorize": { window: 60, max: 5 },
  "relay.ticket": { window: 60, max: 60 },
  "configuration.update": { window: 60, max: 10 },
  "jobs.list": { window: 60, max: 60 },
  "jobs.history": { window: 60, max: 60 },
  "jobs.create": { window: 60, max: 10 },
  "jobs.update": { window: 60, max: 20 },
  "jobs.remove": { window: 60, max: 10 },
  "jobs.run": { window: 60, max: 10 },
  "memory.list": { window: 60, max: 60 },
  "memory.get": { window: 60, max: 60 },
  "memory.history": { window: 60, max: 60 },
  "memory.resolve": { window: 60, max: 30 },
  "memory.create": { window: 60, max: 20 },
  "memory.update": { window: 60, max: 30 },
  "memory.archive": { window: 60, max: 20 },
  "memory.delete": { window: 60, max: 20 },
  "memory.restore": { window: 60, max: 20 },
} satisfies Record<string, RateRule>;
/** True when decoded input carries keys that merge or path-set helpers could abuse. */
function hasPollutingKey(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (Object.hasOwn(item, "__proto__")) return true;
    const constructor = Object.hasOwn(item, "constructor")
      ? (item as { constructor?: unknown }).constructor
      : undefined;
    if (constructor && typeof constructor === "object" && Object.hasOwn(constructor, "prototype"))
      return true;
    pending.push(...Object.values(item));
  }
  return false;
}
export function createRpcBoundary(options: ApiAppOptions) {
  const access = options.access ?? createAccessPolicy();
  const allowedOrigins = normalizeTrustedOrigins(options.allowedOrigins);
  const accountService = createAccountService({
    readSession: (headers) => options.readSession(headers),
  });
  const os = implement(apiContract)
    .$context<{ headers: Headers; requestId: string }>()
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
  type Context = { headers: Headers; requestId: string };
  async function enforceLimit(context: Context, key: string, rule: RateRule) {
    if (options.rateLimit && !(await options.rateLimit(key, rule)))
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { error: { code: "RATE_LIMITED" }, requestId: context.requestId },
      });
  }
  const digest = async (value: string) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  async function controlCall<T>(
    context: Context,
    permission: AccountPermission,
    run: (control: ControlService, auth: AuthSession) => Promise<T>,
    limit?: keyof typeof rpcLimits,
  ) {
    const auth = await requirePermission(context, permission);
    if (!options.control) throw new ORPCError("SERVICE_UNAVAILABLE");
    if (
      limit &&
      options.rateLimit &&
      !(await options.rateLimit(`rpc:${auth.user.id}:${limit}`, rpcLimits[limit]))
    )
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { error: { code: "RATE_LIMITED" }, requestId: context.requestId },
      });
    try {
      return await run(options.control, auth);
    } catch (error) {
      return controlFailure(error, context);
    }
  }
  function controlFailure(error: unknown, context: Context): never {
    if (!(error instanceof ControlError)) throw error;
    const code =
      error.code === "AUTH_REQUIRED" || error.code === "DEVICE_REVOKED"
        ? "UNAUTHORIZED"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : "CONFLICT";
    throw new ORPCError(code, {
      data: { error: { code: error.code }, requestId: context.requestId },
    });
  }
  async function configurationCall<T>(
    context: Context,
    run: (service: ConfigurationService) => Promise<T>,
  ) {
    if (!options.configuration) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.configuration);
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      throw new ORPCError(
        error.code === "CONFIGURATION_CONFLICT"
          ? "CONFLICT"
          : error.code === "INVALID_INPUT"
            ? "BAD_REQUEST"
            : error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN"
              ? error.code
              : "SERVICE_UNAVAILABLE",
        {
          data: { error: { code: error.code }, requestId: context.requestId },
        },
      );
    }
  }
  async function requirePermission(
    context: Context,
    permission: AccountPermission,
    limit?: keyof typeof rpcLimits,
  ) {
    const auth = await options.readSession(context.headers);
    if (!auth)
      throw new ORPCError("UNAUTHORIZED", {
        data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
      });
    if (!hasPermission(access(auth), permission))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "FORBIDDEN" }, requestId: context.requestId },
      });
    if (
      limit &&
      options.rateLimit &&
      !(await options.rateLimit(`rpc:${auth.user.id}:${limit}`, rpcLimits[limit]))
    )
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { error: { code: "RATE_LIMITED" }, requestId: context.requestId },
      });
    return auth;
  }
  async function jobsCall<T>(
    context: Context,
    procedure: keyof typeof rpcLimits,
    write: boolean,
    run: (service: CloudJobsService, userId: string) => Promise<T>,
  ) {
    const auth = await requirePermission(context, "automations.manage");
    if (write) {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin))
        throw new ORPCError("FORBIDDEN", {
          data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
        });
    }
    await enforceLimit(context, `rpc:${auth.user.id}:${procedure}`, rpcLimits[procedure]);
    if (!options.cloudJobs) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.cloudJobs, auth.user.id);
    } catch (error) {
      if (!(error instanceof JobError)) throw error;
      const code =
        error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : ["INVALID_JOB", "INVALID_CRON", "INVALID_INPUT"].includes(error.code)
            ? "BAD_REQUEST"
            : error.code === "AUTH_REQUIRED"
              ? "UNAUTHORIZED"
              : ["CONTROL_UNAVAILABLE", "JOBS_DISABLED"].includes(error.code)
                ? "SERVICE_UNAVAILABLE"
                : "CONFLICT";
      throw new ORPCError(code, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  async function memoryCall<T>(
    context: Context,
    procedure: keyof typeof rpcLimits,
    write: boolean,
    run: (service: ContextLibraryService, owner: string) => Promise<T>,
  ) {
    const auth = await requirePermission(context, "memory.manage");
    if (write) {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin))
        throw new ORPCError("FORBIDDEN", {
          data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
        });
    }
    await enforceLimit(context, `rpc:${auth.user.id}:${procedure}`, rpcLimits[procedure]);
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
  async function instanceCall<T>(
    context: Context,
    owner: boolean,
    write: boolean,
    run: (service: InstanceService, accountId: string) => Promise<T>,
    deviceId?: string,
  ): Promise<T> {
    const auth = owner ? await requirePermission(context, "projects.read") : undefined;
    if (write && owner) {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin)) throw new ORPCError("FORBIDDEN");
    }
    const address = options.clientIpHeader
      ? (context.headers.get(options.clientIpHeader) ?? "unknown")
      : "unknown";
    await enforceLimit(
      context,
      `instance:${auth?.user.id ?? (deviceId ? address + ":" + deviceId : address)}:${owner ? "owner" : "device"}`,
      { window: 60, max: owner ? 30 : 60 },
    );
    if (!options.instances) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.instances, auth?.user.id ?? "");
    } catch (error) {
      if (!(error instanceof InstanceError)) throw error;
      throw new ORPCError(error.code === "INSTANCE_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT", {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  return {
    os,
    controlCall,
    configurationCall,
    requirePermission,
    jobsCall,
    memoryCall,
    instanceCall,
    options,
    allowedOrigins,
    enforceLimit,
    digest,
    controlFailure,
    accountService,
    access,
  };
}
export type RpcBoundary = ReturnType<typeof createRpcBoundary>;
