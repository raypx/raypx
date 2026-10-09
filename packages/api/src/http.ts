import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiErrorCode, FieldErrors, ApiErrorResponse } from "@raypx/contracts/errors";
import { createLogger, withLogContext, type Logger } from "@raypx/logger";

const statuses: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};
const messages: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "Invalid request",
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Access denied",
  NOT_FOUND: "Not found",
  CONFLICT: "Resource conflict",
  RATE_LIMITED: "Too many requests",
  INTERNAL_ERROR: "Internal server error",
  SERVICE_UNAVAILABLE: "Service unavailable",
};

/** A deliberate, client-safe failure. Unexpected errors never expose their message. */
export class HttpError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    readonly errors?: FieldErrors,
  ) {
    super(messages[code]);
    this.name = "HttpError";
    this.status = statuses[code];
  }
}
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  logger: Logger;
}
export interface RequestObservation {
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
}
export interface HttpOptions {
  logger?: Logger;
  observe?: (observation: RequestObservation) => void;
}
// Nitro and SSR can bundle this module separately in one process.
const requestStorageKey = Symbol.for("@raypx/api/request-context/v1");
const shared = globalThis as typeof globalThis & {
  [requestStorageKey]?: AsyncLocalStorage<RequestContext>;
};
const requestStorage = (shared[requestStorageKey] ??= new AsyncLocalStorage<RequestContext>());
const defaultLogger = createLogger({ name: "http" });

/** Returns the current server request context without exposing it to browser packages. */
export function getRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

export function errorResponse(
  error: HttpError,
  requestId = getRequestContext()?.requestId,
): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(requestId ? { requestId } : {}),
        ...(error.errors ? { errors: error.errors } : {}),
      },
    } satisfies ApiErrorResponse,
    { status: error.status },
  );
}

/** Validates external JSON before invoking business code and normalizes validation errors. */
export async function parseJsonBody<T>(
  request: Request,
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
        };
  },
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError("VALIDATION_ERROR");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = new Map<string, string[]>();
    for (const issue of result.error.issues) {
      const field = issue.path.map(String).join(".") || "_root";
      const messages = fields.get(field) ?? [];
      messages.push(issue.message);
      fields.set(field, messages);
    }
    throw new HttpError("VALIDATION_ERROR", Object.fromEntries(fields));
  }
  return result.data;
}

/** Wraps HTTP/SSR work in isolated logging, correlation and a safe error boundary. */
export async function withHttpRequest(
  request: Request,
  handler: (context: RequestContext) => Response | Promise<Response>,
  options: HttpOptions = {},
): Promise<Response> {
  // A route adapter runs inside the global boundary. Catch here before the
  // framework converts deliberate domain failures into a generic 500 response.
  const parent = getRequestContext();
  if (parent) {
    try {
      return await handler(parent);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error, parent.requestId);
      parent.logger.error("Unhandled request error", {
        error,
        method: parent.method,
        path: parent.path,
      });
      return errorResponse(new HttpError("INTERNAL_ERROR"), parent.requestId);
    }
  }
  const incomingId = request.headers.get("x-request-id");
  const requestId =
    incomingId && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const url = new URL(request.url);
  const context: RequestContext = {
    requestId,
    method: request.method,
    path: url.pathname,
    logger: (options.logger ?? defaultLogger).child({ requestId }),
  };
  const started = performance.now();
  return requestStorage.run(context, () =>
    withLogContext({ requestId }, async () => {
      let response: Response;
      try {
        response = await handler(context);
        // Frameworks may catch handler errors before they reach this boundary.
        if (
          /^\/api(?:\/|$)/.test(url.pathname) &&
          url.pathname !== "/api/ready" &&
          response.status >= 500
        )
          response = errorResponse(
            new HttpError(response.status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR"),
            requestId,
          );
      } catch (error) {
        if (error instanceof HttpError) response = errorResponse(error, requestId);
        else {
          context.logger.error("Unhandled request error", {
            error,
            method: context.method,
            path: context.path,
          });
          response = errorResponse(new HttpError("INTERNAL_ERROR"), requestId);
        }
      }
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);
      const result = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      context.logger.info("Request completed", {
        method: context.method,
        path: context.path,
        status: result.status,
        durationMs,
      });
      try {
        options.observe?.({ method: context.method, status: result.status, durationMs, requestId });
      } catch {
        /* Observability cannot change the HTTP response. */
      }
      return result;
    }),
  );
}
