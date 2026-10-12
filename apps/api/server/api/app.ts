import { isMutationProcedure } from "@voidmix/contracts";
import { COMMON_ERROR_STATUS_MAP, ORPCError, RPCSerializer } from "@orpc/server";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  BatchHandlerPlugin,
  GetMethodCsrfProtectionHandlerPlugin,
  RequestCompressionHandlerPlugin,
  RequestHeadersHandlerPlugin,
  ResponseCompressionHandlerPlugin,
  ResponseHeadersHandlerPlugin,
  TimeoutHandlerPlugin,
} from "@orpc/server/plugins";
import { createLoggerConfig, toMiddlewareOptions, type EvlogConfig } from "@voidmix/shared/logger";
import { evlog as honoEvlog, type EvlogVariables } from "@voidmix/shared/logger/hono";
import { withEvlog } from "@voidmix/shared/logger/orpc";
import { resolveRequestLocaleHint } from "@voidmix/i18n/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { nanoid } from "nanoid";
import type { ObjectStorage } from "@voidmix/core";
import { mountLocalStorage } from "./local-storage.js";

import { createCanonicalApiRouter } from "./canonical-router.js";
import { createApiRequestAuthContext, type ApiRequestAuthContext } from "./context.js";
import type { ApiModules } from "./modules.js";
import type { ApiContext } from "./api-types.js";
import type { SessionResolver } from "./session.js";
import { createProblemDetails, problemContentType } from "./problem.js";

export interface CreateApiAppOptions {
  modules: ApiModules;
  resolveSession: SessionResolver;
  allowedOrigins: readonly string[];
  authHandler: (request: Request) => Promise<Response>;
  now?: () => Date;
  loggerConfig?: EvlogConfig;
  localStorage?: { storage: ObjectStorage; signingSecret: string };
  executionGateway?: { fetch(request: Request): Promise<Response> };
}

type ApiEnv = {
  Variables: EvlogVariables["Variables"] & {
    requestId: string;
    locale?: import("@voidmix/i18n/types").Locale;
    auth: ApiRequestAuthContext;
  };
};

const rpcSerializer = new RPCSerializer();

function isRpcPath(path: string): boolean {
  return path === "/rpc" || path.startsWith("/rpc/");
}

function rpcErrorResponse(
  code: string,
  status: 404 | 500,
  data: Record<string, unknown> = { error: { code } },
): Response {
  const error = new ORPCError(code, { data });
  const serialized = rpcSerializer.serialize(error.toJSON());
  if (serialized && typeof serialized === "object" && "json" in serialized) {
    const json = serialized.json;
    if (json && typeof json === "object" && "data" in json) {
      const payload = json as { data?: Record<string, unknown> };
      payload.data = {
        ...(payload.data ?? {}),
        problem: createProblemDetails(
          code,
          status,
          typeof data.requestId === "string" ? data.requestId : "unknown",
        ),
      };
    }
  }
  return Response.json(serialized, { status });
}

export function createApiApp(options: CreateApiAppOptions) {
  const router = createCanonicalApiRouter({
    modules: options.modules,
    ...(options.now ? { now: options.now } : {}),
  });
  const loggerConfig = options.loggerConfig ?? createLoggerConfig({ service: "api" });
  const middlewareOptions = {
    ...toMiddlewareOptions(loggerConfig),
    routes: { "/**": { service: "api" } },
  };
  const handler = withEvlog(
    new RPCHandler(router, {
      plugins: [
        new BodyLimitPlugin<ApiContext>({ maxBodySize: 15_000_000 }),
        new RequestHeadersHandlerPlugin<ApiContext>(),
        new ResponseHeadersHandlerPlugin<ApiContext>(),
        new RequestCompressionHandlerPlugin<ApiContext>(),
        new ResponseCompressionHandlerPlugin<ApiContext>({ threshold: 1024 }),
        new BatchHandlerPlugin<ApiContext>({ maxSize: 10 }),
        new GetMethodCsrfProtectionHandlerPlugin<ApiContext>(),
        new TimeoutHandlerPlugin<ApiContext>({ timeout: 15_000 }),
      ],
      allowMethods: (method, _procedure, path) => {
        const isMutation = isMutationProcedure(path);
        return isMutation ? method === "POST" : method === "GET" || method === "POST";
      },
      errorStatusMap: { ...COMMON_ERROR_STATUS_MAP, MAIL_NOT_CONFIGURED: 503 },
    }),
    {
      ...middlewareOptions,
      include: ["/rpc/**"],
    },
  );
  // Event iterators have their own connection lifecycle and never enter batch/timeout middleware.
  const streamHandler = withEvlog(
    new RPCHandler(router, {
      plugins: [
        new BodyLimitPlugin<ApiContext>({ maxBodySize: 1_000_000 }),
        new RequestHeadersHandlerPlugin<ApiContext>(),
        new ResponseHeadersHandlerPlugin<ApiContext>(),
        new GetMethodCsrfProtectionHandlerPlugin<ApiContext>(),
      ],
      allowMethods: (method, _procedure, path) =>
        !isMutationProcedure(path) && (method === "GET" || method === "POST"),
    }),
    { ...middlewareOptions, include: ["/rpc/**"] },
  );
  const origins = new Set(options.allowedOrigins);
  const app = new Hono<ApiEnv>();
  // Private process credentials are independent of browser sessions and public CORS.
  if (options.executionGateway)
    app.all("/internal/execution/*", (context) => options.executionGateway!.fetch(context.req.raw));

  app.use("*", requestId({ generator: () => nanoid() }));
  app.use("*", honoEvlog({ ...middlewareOptions, exclude: ["/rpc/**", "/api/cloud/storage/**"] }));
  app.use("*", async (context, next) => {
    const log = context.get("log");
    if (log) {
      log.set({
        operation: context.req.path,
        requestId: context.get("requestId"),
        user: null,
        permissionResult: "not_checked",
      });
    }
    await next();
  });
  app.use(
    "/rpc/*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "Accept-Language",
        "ORPC-Batch",
        "Content-Encoding",
        "Standard-Server",
        "Last-Event-ID",
      ],
      exposeHeaders: ["X-Request-ID", "Retry-After", "Standard-Server"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );
  app.use(
    "/api/auth/*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowHeaders: ["Content-Type", "Authorization", "Accept-Language"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );
  app.on(["GET", "POST"], "/api/auth/*", (context) => {
    const request = context.req.raw;
    const headers = new Headers(request.headers);
    headers.set("x-request-id", context.get("requestId"));
    // Nitro may provide a Request-compatible wrapper rather than an Undici
    // instance. Reconstruct from public fields, not Undici private slots.
    return options.authHandler(
      new Request(request.url, {
        method: request.method,
        headers,
        signal: request.signal,
        ...(request.body ? { body: request.body, duplex: "half" as const } : {}),
      }),
    );
  });
  app.get("/health", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json({
      status: "ok",
      timestamp: (options.now?.() ?? new Date()).toISOString(),
    });
  });
  app.use(
    "/api/cloud/storage/*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );
  if (options.localStorage) mountLocalStorage(app, options.localStorage);
  app.use("/rpc/*", async (context, next) => {
    const request = context.req.raw;
    context.set("auth", {
      ...createApiRequestAuthContext(await options.resolveSession(request)),
      revalidateSession: () => options.resolveSession(request),
    });
    await next();
  });
  app.use("/rpc/*", async (context, next) => {
    const requestId = context.get("requestId");
    const request = context.req.raw;
    const locale = resolveRequestLocaleHint(request.headers);
    const connectionHandler =
      /\/cloud\/(?:runs|conversations)\/stream$|\/projects\/agentRuns\/events\/stream$/.test(
        context.req.path,
      )
        ? streamHandler
        : handler;
    const { matched, response } = await connectionHandler.handle(request, {
      prefix: "/rpc",
      context: {
        requestId,
        ...(locale ? { locale } : {}),
        auth: context.get("auth"),
      },
    });

    if (matched) return context.newResponse(response.body, response);
    await next();
  });
  app.notFound((context) =>
    isRpcPath(context.req.path)
      ? rpcErrorResponse("NOT_FOUND", 404)
      : problemContentType(
          context.json(
            {
              code: "NOT_FOUND",
              data: { error: { code: "NOT_FOUND" } },
              problem: createProblemDetails("NOT_FOUND", 404, context.get("requestId")),
            },
            404,
          ),
        ),
  );
  app.onError((error, context) => {
    context.get("log")?.error(error);
    if (isRpcPath(context.req.path)) {
      return rpcErrorResponse("INTERNAL_SERVER_ERROR", 500, {
        error: { code: "INTERNAL_SERVER_ERROR" },
        requestId: context.get("requestId"),
      });
    }
    return problemContentType(
      context.json(
        {
          code: "INTERNAL_SERVER_ERROR",
          data: { error: { code: "INTERNAL_SERVER_ERROR" } },
          problem: createProblemDetails("INTERNAL_SERVER_ERROR", 500, context.get("requestId")),
          requestId: context.get("requestId"),
        },
        500,
      ),
    );
  });

  return app;
}
