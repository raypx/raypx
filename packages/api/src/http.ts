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
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  REQUEST_TIMEOUT: 408,
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
  PAYLOAD_TOO_LARGE: "Request body too large",
  UNSUPPORTED_MEDIA_TYPE: "Unsupported media type",
  REQUEST_TIMEOUT: "Request timed out",
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
  /** Incoming/caller cancellation, and downstream cancellation when tracking a body. */
  readonly signal: AbortSignal;
}
export interface RequestObservation {
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
  route: string;
}
/** Duration always measures request entry to this event, never socket delivery. */
export type RequestLifecycleEvent =
  | (RequestObservation & { phase: "response-ready" })
  | (Omit<RequestObservation, "status"> & {
      phase: "response-finished";
      status: number | null;
      outcome: "complete" | "cancelled" | "error";
    });
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
  /** Request-wide caller cancellation, independent of the native connection signal. */
  signal?: AbortSignal;
  /** Opts into lazy body tracking. Legacy observe still runs once at response-ready. */
  observeLifecycle?: (event: RequestLifecycleEvent) => void | Promise<void>;
}
// Nitro and SSR can bundle this module separately in one process.
const requestStorageKey = Symbol.for("@raypx/api/request-context/v1");
const shared = globalThis as typeof globalThis & {
  [requestStorageKey]?: AsyncLocalStorage<RequestContext>;
};
const requestStorage = (shared[requestStorageKey] ??= new AsyncLocalStorage<RequestContext>());
const defaultLogger = createLogger({ name: "http" });

interface RequestState {
  controller: AbortController;
  trackedSignals: Set<AbortSignal>;
  cleanup: (() => void)[];
  trackBody: boolean;
  ready?: RequestObservation;
  finished: boolean;
  run: <T>(operation: () => T) => T;
  finish: (outcome: "complete" | "cancelled" | "error") => void;
}
const statesKey = Symbol.for("@raypx/api/request-lifecycle/v1");
const lifecycleShared = globalThis as typeof globalThis & {
  [statesKey]?: WeakMap<RequestContext, RequestState>;
};
const requestStates = (lifecycleShared[statesKey] ??= new WeakMap<RequestContext, RequestState>());

function notify<T>(observer: ((event: T) => void | Promise<void>) | undefined, event: T): void {
  try {
    const pending = observer?.(event);
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // An observer cannot change the business response or stream.
  }
}

/** Only a known request cancellation can turn an AbortError into a cancelled outcome. */
function isRequestCancellation(error: unknown, context: RequestContext): boolean {
  return (
    context.signal.aborted &&
    (error === context.signal.reason || (error instanceof Error && error.name === "AbortError"))
  );
}

function registerCallerSignal(state: RequestState, signal: AbortSignal): void {
  if (state.finished || state.trackedSignals.has(signal)) return;
  state.trackedSignals.add(signal);
  // A nested caller's listener must stay until its returned body terminates.
  state.trackBody = true;
  const abort = () => state.controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  state.cleanup.push(() => signal.removeEventListener("abort", abort));
  if (signal.aborted) abort();
}

function trackResponseBody(response: Response, context: RequestContext, state: RequestState) {
  if (!response.body || context.method === "HEAD") {
    state.finish("complete");
    return response;
  }
  const reader = response.body.getReader();
  let released = false;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const release = () => {
    if (released) return;
    released = true;
    context.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  };
  const abort = () =>
    state.run(() => {
      const error = cancellationError(context.signal);
      state.finish("cancelled");
      void reader.cancel(error).catch(() => undefined);
      streamController.error(error);
      release();
    });
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        streamController = controller;
      },
      pull(controller) {
        return state.run(async () => {
          try {
            const result = await reader.read();
            if (context.signal.aborted) throw cancellationError(context.signal);
            if (result.done) {
              state.finish("complete");
              release();
              controller.close();
            } else controller.enqueue(result.value);
          } catch (error) {
            if (!state.finished) {
              const cancelled = isRequestCancellation(error, context);
              if (!cancelled) context.logger.error("Response stream failed", { error });
              state.finish(cancelled ? "cancelled" : "error");
            }
            release();
            controller.error(error);
          }
        });
      },
      cancel(reason) {
        return state.run(() => {
          state.finish("cancelled");
          // Avoid re-entering abort while the downstream stream is already closed.
          context.signal.removeEventListener("abort", abort);
          state.controller.abort(new DOMException("Response cancelled", "AbortError"));
          const pending = reader.cancel(reason);
          release();
          return pending;
        });
      },
    },
    { highWaterMark: 0 },
  );
  context.signal.addEventListener("abort", abort, { once: true });
  if (context.signal.aborted) abort();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

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
    context.signal.throwIfAborted();
    for (const guard of options.guards ?? []) {
      const result = await guard(request, context);
      if (result) new Headers(result).forEach((value, key) => headers.set(key, value));
    }
    response = await handler(context);
    context.signal.throwIfAborted();
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
    if (isRequestCancellation(error, context)) throw error;
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

export interface RequestBodyOptions {
  /** Maximum actual byte count. Defaults to 1 MiB; accepts 1 through 64 MiB. */
  maxBytes?: number;
  /** Total body-read deadline. Defaults to 10 seconds; accepts 1 through 120000 ms. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

function cancellationError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error && reason.name === "AbortError"
    ? reason
    : new DOMException("Request cancelled", "AbortError");
}

/**
 * Reads original request bytes once, bounding size before decoding or parsing.
 * Content-Length is only an early rejection hint. Actual chunks are always counted.
 * A timeout/size failure cancels the source without waiting for its cancellation
 * promise, so an uncooperative source cannot hold the request open. Native/caller
 * aborts remain AbortErrors. Provider adapters can reconstruct a Request from these
 * unchanged bytes; do not clone/tee the incoming body to inspect it separately.
 */
export async function readRequestBody(
  request: Request,
  options: RequestBodyOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const maxBytes = options.maxBytes ?? 1_048_576;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 67_108_864)
    throw new Error("Body limit must be an integer between 1 and 67108864 bytes");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new Error("Body deadline must be an integer between 1 and 120000 milliseconds");
  const signals = [request.signal, getRequestContext()?.signal, options.signal].filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  const signal = AbortSignal.any(signals);
  if (signal.aborted) throw cancellationError(signal);
  if (request.bodyUsed || request.body?.locked)
    throw new Error("Request body has already been consumed or locked");
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw new HttpError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let failure: Error | undefined;
  let rejectRead!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectRead = reject;
  });
  const stop = (error: Error) => {
    if (failure) return;
    failure = error;
    rejectRead(error);
    void reader.cancel(error).catch(() => undefined);
  };
  const abort = () => stop(cancellationError(signal));
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => stop(new HttpError("REQUEST_TIMEOUT")), timeoutMs);
  try {
    if (signal.aborted) abort();
    for (;;) {
      const result = await Promise.race([reader.read(), interrupted]);
      if (failure) throw failure;
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        const error = new HttpError("PAYLOAD_TOO_LARGE");
        void reader.cancel(error).catch(() => undefined);
        throw error;
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Validates bounded JSON with an explicit JSON media type before business work. */
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
  options: RequestBodyOptions = {},
): Promise<T> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mediaType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(mediaType))
    throw new HttpError("UNSUPPORTED_MEDIA_TYPE");
  const bytes = await readRequestBody(request, options);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
    const state = requestStates.get(parent);
    if (options.signal && state) registerCallerSignal(state, options.signal);
    if (options.route) parent.route = options.route;
    return invokeHandler(request, parent, handler, options);
  }
  const incomingId = request.headers.get("x-request-id");
  const requestId =
    incomingId && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const url = new URL(request.url);
  const controller = new AbortController();
  const signals = options.signal
    ? [request.signal, options.signal, controller.signal]
    : [request.signal, controller.signal];
  const context: RequestContext = {
    requestId,
    method: request.method,
    path: url.pathname,
    route: options.route ?? "unmatched",
    logger: (options.logger ?? defaultLogger).child({ requestId }),
    signal: AbortSignal.any(signals),
  };
  const started = performance.now();
  const duration = () => Math.round((performance.now() - started) * 100) / 100;
  const state: RequestState = {
    controller,
    trackedSignals: new Set(signals),
    cleanup: [],
    trackBody: Boolean(options.observeLifecycle),
    finished: false,
    run: (operation) => operation(),
    finish(outcome) {
      if (state.finished) return;
      state.finished = true;
      for (const cleanup of state.cleanup.splice(0)) cleanup();
      if (!options.observeLifecycle) return;
      const event: RequestLifecycleEvent = {
        phase: "response-finished",
        outcome,
        method: context.method,
        status: state.ready?.status ?? null,
        durationMs: duration(),
        requestId,
        route: state.ready?.route ?? context.route,
      };
      state.run(() => {
        context.logger.info("Response finished", event);
        notify(options.observeLifecycle, event);
      });
    },
  };
  requestStates.set(context, state);
  return requestStorage.run(context, () =>
    withLogContext({ requestId }, async () => {
      const snapshot = AsyncLocalStorage.snapshot();
      state.run = (operation) => snapshot(operation);
      const cancelled = () => state.finish("cancelled");
      context.signal.addEventListener("abort", cancelled, { once: true });
      state.cleanup.push(() => context.signal.removeEventListener("abort", cancelled));
      let response: Response;
      try {
        response = await invokeHandler(request, context, handler, options);
        context.signal.throwIfAborted();
      } catch (error) {
        if (isRequestCancellation(error, context)) {
          state.finish("cancelled");
          throw cancellationError(context.signal);
        }
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
      const durationMs = duration();
      state.ready = {
        method: context.method,
        status: result.status,
        durationMs,
        requestId,
        route: context.route,
      };
      context.logger.info("Request completed", {
        method: context.method,
        path: context.path,
        status: result.status,
        durationMs,
        phase: "response-ready",
      });
      notify(options.observe, state.ready);
      notify(options.observeLifecycle, { ...state.ready, phase: "response-ready" });
      if (state.trackBody) return trackResponseBody(result, context, state);
      state.finish("complete");
      return result;
    }),
  );
}
