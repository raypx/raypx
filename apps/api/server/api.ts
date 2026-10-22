import { ControlError, type ControlService } from "./control/service.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import {
  PrototypePollutionProtectionHandlerPlugin,
  TimeoutHandlerPlugin,
} from "@orpc/server/plugins";
import { apiContract } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/auth/types";
import { createAccountService } from "@raypx/account/server";
import type { RequestLogger } from "@raypx-kit/logger";
import { createRpcLoggingPlugin, diagnosticRoute, type ApiLogging } from "./logging.js";
import type { RateLimiter, RateRule } from "./rate-limit.js";

export interface ApiAppOptions {
  control?: ControlService;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  authHandler(request: Request): Promise<Response>;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  mailAvailable?: boolean;
  logger?: ApiLogging;
  rateLimit?: RateLimiter;
  /** Upper bound for producing one RPC response (default 15 s). */
  rpcTimeoutMs?: number;
  /** Named dependency probes for `/ready`; each resolves when the dependency answers. */
  readiness?: Record<string, () => Promise<unknown>>;
}
// Per-account limits for procedures that create grants, devices or relay tickets.
const rpcLimits = {
  "devices.register": { window: 60, max: 10 },
  "devices.refreshGrant": { window: 60, max: 30 },
  "relay.ticket": { window: 60, max: 60 },
} satisfies Record<string, RateRule>;
/**
 * Letters only, so log redaction never mistakes an ID for a card or phone number and
 * masks it: the same ID must appear in responses, logs and error reports.
 */
export function newRequestId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return `req_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => alphabet[byte % 26]).join("")}`;
}
export function createApiApp(options: ApiAppOptions) {
  const accountService = createAccountService({
    readSession: (headers) => options.readSession(headers),
  });
  const app = new Hono<{
    Variables: { requestId: string; requestLog?: RequestLogger; rpcLogged: boolean };
  }>();
  app.use("*", async (c, next) => {
    const requestId = newRequestId();
    c.set("requestId", requestId);
    c.set("rpcLogged", false);
    const log = options.logger?.createLogger({
      operation: "http.request",
      requestId,
      method: c.req.method,
      route: diagnosticRoute(c.req.path),
    });
    if (log) c.set("requestLog", log);
    try {
      await next();
    } finally {
      c.header("x-request-id", requestId);
      // CORS preflights and non-RPC requests finish here. The RPC plugin owns
      // matched and unmatched RPC requests, including their errors.
      if (!c.get("rpcLogged")) {
        if (c.res.status >= 500 && !c.error) log?.error(new Error("HTTP request failed"));
        log?.emit({ status: c.res.status });
      }
    }
  });
  app.use(
    "*",
    secureHeaders({
      // The API serves JSON only: nothing may load, frame or embed its responses.
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: "DENY",
      // Web and Desktop read responses cross-origin; CORS remains the access control.
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (options.allowedOrigins.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Accept-Language", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      // Every JSON RPC call is preflighted; let browsers reuse the answer for ten minutes.
      maxAge: 600,
    }),
  );
  app.get("/health", (c) => c.json({ status: "ok" }));
  // Readiness, unlike liveness, checks dependencies so platforms can drain an instance
  // that cannot reach PostgreSQL or Redis. Results name dependencies, never errors.
  app.get("/ready", async (c) => {
    const checks = Object.fromEntries(
      await Promise.all(
        Object.entries(options.readiness ?? {}).map(async ([name, probe]) => {
          const timeout = AbortSignal.timeout(3000);
          const ok = await Promise.race([
            probe().then(
              () => true,
              () => false,
            ),
            new Promise<boolean>((resolve) =>
              timeout.addEventListener("abort", () => resolve(false), { once: true }),
            ),
          ]);
          return [name, ok ? "ok" : "unavailable"] as const;
        }),
      ),
    );
    const ready = Object.values(checks).every((value) => value === "ok");
    return c.json({ status: ready ? "ok" : "unavailable", checks }, ready ? 200 : 503);
  });
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    const path = decodeURIComponent(c.req.path).replace(/\/+$/, "");
    if (
      options.mailAvailable === false &&
      c.req.method === "POST" &&
      [
        "/api/auth/sign-up/email",
        "/api/auth/send-verification-email",
        "/api/auth/request-password-reset",
      ].includes(path)
    ) {
      return c.json(
        { code: "MAIL_NOT_CONFIGURED", message: "Authentication email is unavailable" },
        503,
      );
    }
    return options.authHandler(c.req.raw);
  });
  const os = implement(apiContract)
    .$context<{ headers: Headers; requestId: string }>()
    // TimeoutHandlerPlugin only aborts the signal; database calls do not observe it,
    // so answer as soon as it fires instead of waiting for them.
    .use(({ next, signal, context }) => {
      if (!signal) return next();
      return Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          const fail = () =>
            reject(
              new ORPCError("GATEWAY_TIMEOUT", {
                data: { error: { code: "REQUEST_TIMEOUT" }, requestId: context.requestId },
              }),
            );
          if (signal.aborted) fail();
          else signal.addEventListener("abort", fail, { once: true });
        }),
      ]);
    });
  type Context = { headers: Headers; requestId: string };
  async function controlCall<T>(
    context: Context,
    run: (control: ControlService, auth: AuthSession) => Promise<T>,
    limit?: keyof typeof rpcLimits,
  ) {
    const auth = await options.readSession(context.headers);
    if (!auth)
      throw new ORPCError("UNAUTHORIZED", {
        data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
      });
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
  const router = os.router({
    devices: {
      register: os.devices.register.handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.register(auth, input), "devices.register"),
      ),
      refreshGrant: os.devices.refreshGrant.handler(({ input, context }) =>
        controlCall(
          context,
          (control, auth) => control.refreshGrant(auth, input),
          "devices.refreshGrant",
        ),
      ),
      list: os.devices.list.handler(({ context }) =>
        controlCall(context, (control, auth) => control.listDevices(auth.user.id)),
      ),
      revoke: os.devices.revoke.handler(({ input, context }) =>
        controlCall(context, async (control, auth) => {
          const result = await control.revoke(auth.user.id, input);
          await options.onRevoke?.(auth.user.id, input.deviceId);
          return result;
        }),
      ),
    },
    tasks: {
      list: os.tasks.list.handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.listTasks(auth.user.id, input)),
      ),
      get: os.tasks.get.handler(({ input, context }) =>
        controlCall(context, (control, auth) =>
          control.getTask(auth.user.id, input.id, input.after),
        ),
      ),
    },
    approvals: {
      list: os.approvals.list.handler(({ context }) =>
        controlCall(context, (control, auth) => control.listApprovals(auth.user.id)),
      ),
    },
    relay: {
      ticket: os.relay.ticket.handler(({ context }) =>
        controlCall(context, (control, auth) => control.ticket(auth), "relay.ticket"),
      ),
    },
    account: {
      get: os.account.get.handler(async ({ context }) => {
        const account = await accountService.get(context.headers);
        if (!account)
          throw new ORPCError("UNAUTHORIZED", {
            data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
          });
        return account;
      }),
    },
  });
  const rpc = new RPCHandler(router, {
    plugins: [
      new PrototypePollutionProtectionHandlerPlugin(),
      new TimeoutHandlerPlugin({ timeout: options.rpcTimeoutMs ?? 15_000 }),
      ...(options.logger ? [createRpcLoggingPlugin(options.logger)] : []),
    ],
  });
  app.all("/rpc/*", async (c) => {
    const headers = new Headers(c.req.raw.headers);
    // Use the same server-owned ID in the plugin, response and error contract.
    headers.set("x-request-id", c.get("requestId"));
    // Nitro can supply a Request-compatible wrapper without Undici's private
    // state. Build from public fields so Node can accept it, preserving the
    // request stream and cancellation signal without reading the body.
    const request = new Request(c.req.url, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      signal: c.req.raw.signal,
      duplex: "half",
    });
    c.set("rpcLogged", Boolean(options.logger));
    const result = await rpc.handle(request, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers, requestId: c.get("requestId") },
    });
    return result.matched ? result.response : c.notFound();
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" }, requestId: c.get("requestId") }, 404));
  app.onError((error, c) => {
    if (!c.get("rpcLogged")) c.get("requestLog")?.error(error);
    return c.json({ error: { code: "INTERNAL_SERVER_ERROR" }, requestId: c.get("requestId") }, 500);
  });
  return app;
}
