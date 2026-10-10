import { AsyncLocalStorage } from "node:async_hooks";
import {
  fieldErrorsSchema,
  type ApiErrorCode,
  type FieldErrors,
  type ApiErrorResponse,
} from "@raypx/contracts/errors";
import { createLogger, withLogContext, type Logger } from "@raypx/logger";

/** Compatible with native fetch headers in Node and Bun without requiring DOM types. */
export type HttpHeaders = ConstructorParameters<typeof Headers>[0];

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

const httpErrorBrand = Symbol.for("@raypx/api/http-error/v1");
const registeredErrorsKey = Symbol.for("@raypx/api/http-error-instances/v1");
const registered = globalThis as typeof globalThis & { [registeredErrorsKey]?: WeakSet<Error> };
const registeredErrors = (registered[registeredErrorsKey] ??= new WeakSet<Error>());

/** A deliberate, client-safe failure. Unexpected errors never expose their message. */
export interface HttpErrorOptions {
  /** Public response metadata, such as Retry-After. Never place secrets here. */
  headers?: HttpHeaders;
}
export class HttpError extends Error {
  readonly [httpErrorBrand] = true;
  readonly status: number;
  readonly headers: Headers;
  constructor(
    readonly code: ApiErrorCode,
    readonly errors?: FieldErrors,
    options: HttpErrorOptions = {},
  ) {
    super(messages[code]);
    this.name = "HttpError";
    this.status = statuses[code];
    this.headers = new Headers(options.headers);
    registeredErrors.add(this);
  }
}

/**
 * Recognizes deliberate failures minted by another bundle in this process.
 * Plain wire objects and forged brands are not trusted. Even registered errors
 * must retain their fixed public code/status/message and valid response metadata.
 */
export function isHttpError(value: unknown): value is HttpError {
  if (!(value instanceof Error) || !registeredErrors.has(value)) return false;
  const error = value as Error & {
    [httpErrorBrand]?: unknown;
    code?: unknown;
    status?: unknown;
    headers?: unknown;
    errors?: unknown;
  };
  try {
    for (const key of [httpErrorBrand, "name", "code", "status", "message", "headers", "errors"]) {
      const property = Object.getOwnPropertyDescriptor(error, key);
      if (!property || !("value" in property)) return false;
    }
    if (
      error[httpErrorBrand] !== true ||
      error.name !== "HttpError" ||
      typeof error.code !== "string" ||
      !Object.hasOwn(statuses, error.code)
    )
      return false;
    const code = error.code as ApiErrorCode;
    if (
      error.status !== statuses[code] ||
      error.message !== messages[code] ||
      !(error.headers instanceof Headers)
    )
      return false;
    return error.errors === undefined || fieldErrorsSchema.safeParse(error.errors).success;
  } catch {
    return false;
  }
}
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  /** Static application route label; never derive this from an unbounded URL. */
  route: string;
  logger: Logger;
}
export interface RequestObservation {
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
  route: string;
}
/** Runs before business work. Allowed guards may attach public response headers. */
export type RequestGuard = (
  request: Request,
  context: RequestContext,
) => void | HttpHeaders | Promise<void | HttpHeaders>;
export interface HttpOptions {
  logger?: Logger;
  observe?: (observation: RequestObservation) => void;
  /** A static route template or label, also usable by the enclosing observer. */
  route?: string;
  guards?: readonly RequestGuard[];
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
  const headers = new Headers(error.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(requestId ? { requestId } : {}),
        ...(error.errors ? { errors: error.errors } : {}),
      },
    } satisfies ApiErrorResponse,
    { status: error.status, headers },
  );
}

async function invokeHandler(
  request: Request,
  context: RequestContext,
  handler: (context: RequestContext) => Response | Promise<Response>,
  options: HttpOptions,
): Promise<Response> {
  const headers = new Headers();
  let response: Response;
  try {
    for (const guard of options.guards ?? []) {
      const result = await guard(request, context);
      if (result) new Headers(result).forEach((value, key) => headers.set(key, value));
    }
    response = await handler(context);
    // Frameworks may catch handler errors before they reach this boundary.
    if (
      /^\/api(?:\/|$)/.test(context.path) &&
      context.path !== "/api/ready" &&
      response.status >= 500
    )
      response = errorResponse(
        new HttpError(
          response.status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
          undefined,
          { headers: response.headers },
        ),
        context.requestId,
      );
  } catch (error) {
    if (isHttpError(error)) response = errorResponse(error, context.requestId);
    else {
      context.logger.error("Unhandled request error", {
        error,
        method: context.method,
        path: context.path,
      });
      response = errorResponse(new HttpError("INTERNAL_ERROR"), context.requestId);
    }
  }
  // A nested adapter's more specific metadata takes precedence over outer guards.
  const resultHeaders = new Headers(response.headers);
  headers.forEach((value, key) => {
    if (!resultHeaders.has(key)) resultHeaders.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resultHeaders,
  });
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
    if (options.route) parent.route = options.route;
    return invokeHandler(request, parent, handler, options);
  }
  const incomingId = request.headers.get("x-request-id");
  const requestId =
    incomingId && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const url = new URL(request.url);
  const context: RequestContext = {
    requestId,
    method: request.method,
    path: url.pathname,
    route: options.route ?? "unmatched",
    logger: (options.logger ?? defaultLogger).child({ requestId }),
  };
  const started = performance.now();
  return requestStorage.run(context, () =>
    withLogContext({ requestId }, async () => {
      let response: Response;
      try {
        response = await invokeHandler(request, context, handler, options);
      } catch (error) {
        if (isHttpError(error)) response = errorResponse(error, requestId);
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
        options.observe?.({
          method: context.method,
          status: result.status,
          durationMs,
          requestId,
          route: context.route,
        });
      } catch {
        /* Observability cannot change the HTTP response. */
      }
      return result;
    }),
  );
}
