import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { ApiClientError } from "./errors.js";

/** JSON-compatible values. Non-finite numbers and cyclic objects are rejected at runtime. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

/** Structural parser contract compatible with Zod. */
export interface ResponseSchema<T> {
  parse(value: unknown): T;
}

export interface RequestJsonOptions<T> {
  path: string;
  schema: ResponseSchema<T>;
  method?: HttpMethod;
  body?: JsonValue;
  headers?: RequestInit["headers"];
  signal?: AbortSignal;
  /** Total deadline including retries and response reading. Defaults to 5000 ms. */
  timeoutMs?: number;
  /** Opt-in transient retries, only for GET/HEAD, with at most three retries. */
  retry?: { maxRetries: number; delayMs?: number };
}

function assertJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new Error("Body must contain only JSON values");
  if (ancestors.has(value)) throw new Error("Body must not contain cycles");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Body must contain only plain JSON objects");
  ancestors.add(value);
  for (const item of Object.values(value)) assertJson(item, ancestors);
  ancestors.delete(value);
}

function validateOptions<T>(options: RequestJsonOptions<T>, method: HttpMethod): void {
  const hasControlCharacter = options.path.split("").some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!/^\/(?!\/)/.test(options.path) || /[\\\s#]/.test(options.path) || hasControlCharacter)
    throw new ApiClientError("invalid-request", "Request path must be a same-origin absolute path");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647)
    throw new ApiClientError("invalid-request", "Request timeout must be a non-negative integer");
  if ((method === "GET" || method === "HEAD") && options.body !== undefined)
    throw new ApiClientError("invalid-request", "GET and HEAD requests cannot contain a body");
  if (options.retry) {
    if (method !== "GET" && method !== "HEAD")
      throw new ApiClientError(
        "invalid-request",
        "Retries are available only for GET and HEAD requests",
      );
    if (
      !Number.isInteger(options.retry.maxRetries) ||
      options.retry.maxRetries < 0 ||
      options.retry.maxRetries > 3
    )
      throw new ApiClientError("invalid-request", "Retry count must be between zero and three");
    const delayMs = options.retry.delayMs ?? 100;
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 1000)
      throw new ApiClientError("invalid-request", "Retry delay must be between zero and 1000 ms");
  }
}

function abortError(signal: AbortSignal, callerSignal?: AbortSignal): ApiClientError {
  const reason: unknown = signal.reason;
  const timedOut =
    !callerSignal?.aborted && reason instanceof Error && reason.name === "TimeoutError";
  return new ApiClientError(
    timedOut ? "timeout" : "aborted",
    timedOut ? "Request timed out" : "Request cancelled",
    { cause: reason },
  );
}

function requestIdHeader(response: Response): string | undefined {
  const value = response.headers.get("x-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

async function parseResponse<T>(
  response: Response,
  schema: ResponseSchema<T>,
  method: HttpMethod,
): Promise<T> {
  const details = { status: response.status, requestId: requestIdHeader(response) };
  if (method === "HEAD") {
    if (!response.ok) throw new ApiClientError("http", `HTTP ${response.status}`, details);
    try {
      return schema.parse(undefined);
    } catch (cause) {
      throw new ApiClientError(
        "invalid-response",
        "API response did not match the expected contract",
        { ...details, cause },
      );
    }
  }
  let payload: unknown;
  try {
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(contentType))
      throw new Error("Expected a JSON content type");
    payload = await response.json();
  } catch (cause) {
    throw new ApiClientError(
      "invalid-response",
      `HTTP ${response.status}: API returned an invalid JSON response`,
      { ...details, cause },
    );
  }
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(payload);
    if (!parsed.success)
      throw new ApiClientError(
        "invalid-response",
        `HTTP ${response.status}: API returned an invalid error response`,
        { ...details, cause: parsed.error },
      );
    throw new ApiClientError("http", parsed.data.error.message, {
      ...details,
      ...parsed.data.error,
      requestId: parsed.data.error.requestId ?? details.requestId,
    });
  }
  try {
    return schema.parse(payload);
  } catch (cause) {
    throw new ApiClientError(
      "invalid-response",
      "API response did not match the expected contract",
      { ...details, cause },
    );
  }
}

function transient(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.kind === "network" ||
      (error.kind === "http" &&
        error.status !== undefined &&
        [408, 429, 500, 502, 503, 504].includes(error.status)))
  );
}

async function retryDelay(
  delayMs: number,
  signal: AbortSignal,
  callerSignal?: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw abortError(signal, callerSignal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal, callerSignal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Requests a same-origin JSON API, validates responses, and throws ApiClientError on failure. */
export async function requestJson<T>(options: RequestJsonOptions<T>): Promise<T> {
  const method = options.method ?? "GET";
  validateOptions(options, method);
  let body: string | undefined;
  let headers: Headers;
  try {
    headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body !== undefined) {
      assertJson(options.body);
      body = JSON.stringify(options.body);
      headers.set("Content-Type", "application/json");
    }
  } catch (cause) {
    throw new ApiClientError("invalid-request", "Request headers or JSON body are invalid", {
      cause,
    });
  }
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 5000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const maxRetries = options.retry?.maxRetries ?? 0;
  for (let attempt = 0; ; attempt += 1) {
    if (signal.aborted) throw abortError(signal, options.signal);
    try {
      let response: Response;
      try {
        response = await fetch(options.path, {
          method,
          headers,
          body,
          credentials: "same-origin",
          mode: "same-origin",
          signal,
        });
      } catch (cause) {
        if (signal.aborted) throw abortError(signal, options.signal);
        throw new ApiClientError("network", "Network request failed", { cause });
      }
      const result = await parseResponse(response, options.schema, method);
      if (signal.aborted) throw abortError(signal, options.signal);
      return result;
    } catch (error) {
      if (signal.aborted) throw abortError(signal, options.signal);
      if (attempt >= maxRetries || !transient(error)) throw error;
      await retryDelay(options.retry?.delayMs ?? 100, signal, options.signal);
    }
  }
}
