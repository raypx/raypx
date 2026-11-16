import { scrubProtectedValue } from "@raypx/core/protected-input";
import { WEATHER_API_URL, WEB_SEARCH_API_URL } from "@raypx/core/openapi-servers";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  RemoteEndpointError,
  resolveRemoteEndpoint,
  validateRemoteEndpoint,
  type RemoteResolver,
  type ResolvedEndpoint,
} from "../core/http-egress.js";
import { matchesOpenApiSchema, type OpenApiToolOperation } from "./document.js";
import { tavilyPublicUrl, tavilyResult, tavilyToolName } from "./tavily.js";
import { isWeatherOperation, lookupWeather, weatherArguments } from "./open-meteo.js";
export class OpenApiTransportError extends Error {
  constructor(
    readonly code:
      | "INVALID_ENDPOINT"
      | "AUTHENTICATION_FAILED"
      | "RATE_LIMITED"
      | "TIMED_OUT"
      | "REQUEST_FAILED"
      | "INVALID_ARGUMENTS",
  ) {
    super(code);
  }
}
export interface OpenApiReply {
  status: number;
  headers: Headers;
  body: string;
}
export interface OpenApiTransportOptions {
  resolver?: RemoteResolver;
  timeoutMs?: number;
  now?: () => Date;
  request?: (
    endpoint: ResolvedEndpoint,
    method: string,
    headers: Readonly<Record<string, string>>,
    body: string | undefined,
    signal: AbortSignal,
  ) => Promise<OpenApiReply>;
}
export interface OpenApiTransport {
  validate(this: void, url: string): void;
  fetchDocument(this: void, url: string, signal: AbortSignal): Promise<string>;
  test(
    this: void,
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
    preset?: "tavily" | "open-meteo",
  ): Promise<void>;
  call(
    this: void,
    url: string,
    headers: Record<string, string>,
    operation: OpenApiToolOperation,
    args: Record<string, unknown>,
    signal: AbortSignal,
    protectedInput?: { query?: { name: string; value: string }; protectedValues: string[] },
  ): Promise<{ status: number; content: string; truncated: boolean; isError: boolean }>;
}
function request(
  endpoint: ResolvedEndpoint,
  method: string,
  headers: Readonly<Record<string, string>>,
  body: string | undefined,
  signal: AbortSignal,
): Promise<OpenApiReply> {
  return new Promise((resolve, reject) => {
    const send = endpoint.url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      endpoint.url,
      {
        method,
        headers,
        signal,
        agent: false,
        lookup(_hostname, _options, callback) {
          callback(null, endpoint.address, endpoint.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > 262144) {
            req.destroy();
            reject(new OpenApiTransportError("REQUEST_FAILED"));
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", () => reject(new OpenApiTransportError("REQUEST_FAILED")));
        response.once("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers))
            if (value !== undefined)
              responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
          resolve({
            status: response.statusCode ?? 500,
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.once("error", () => reject(new OpenApiTransportError("REQUEST_FAILED")));
    req.end(body);
  });
}
export function createOpenApiTransport(options: OpenApiTransportOptions = {}): OpenApiTransport {
  const send = options.request ?? request;
  async function perform(
    target: URL,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    parent: AbortSignal,
    allowError = false,
    redactValues: readonly string[] = [],
    readUrl?: string,
  ) {
    const controller = new AbortController();
    let timedOut = false;
    const stop = () => controller.abort();
    parent.addEventListener("abort", stop, { once: true });
    if (parent.aborted) stop();
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs ?? 10000);
    function abortable<T>(operation: Promise<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        const abort = () =>
          reject(new OpenApiTransportError(timedOut ? "TIMED_OUT" : "REQUEST_FAILED"));
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        void operation
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener("abort", abort));
      });
    }
    try {
      if (readUrl) {
        const page = new URL(readUrl);
        page.protocol = "https:";
        page.search = "";
        const resolved = await abortable(resolveRemoteEndpoint(page.href, options.resolver));
        if (resolved.url.hostname === "localhost") throw new RemoteEndpointError();
      }
      // Query values are supplied separately from endpoint admission; resolution
      // and the socket always use the same admitted host/address.
      const admission = new URL(target);
      admission.search = "";
      const endpoint = await abortable(resolveRemoteEndpoint(admission.href, options.resolver));
      endpoint.url = target;
      const result = await abortable(
        send(
          endpoint,
          method,
          {
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...headers,
          },
          body,
          controller.signal,
        ),
      );
      if (result.status >= 300 && result.status < 400)
        throw new OpenApiTransportError("INVALID_ENDPOINT");
      if (result.status === 401 || result.status === 403)
        throw new OpenApiTransportError("AUTHENTICATION_FAILED");
      if (result.status === 429) throw new OpenApiTransportError("RATE_LIMITED");
      if (!allowError && (result.status < 200 || result.status >= 300))
        throw new OpenApiTransportError("REQUEST_FAILED");
      if (Buffer.byteLength(result.body, "utf8") > 262144)
        throw new OpenApiTransportError("REQUEST_FAILED");
      const protectedValues = Object.values(headers)
        .flatMap((value) => [value, value.replace(/^Bearer /, "")])
        .filter(Boolean);
      function contains(value: unknown): boolean {
        if (typeof value === "string")
          return protectedValues.some((secret) => value.includes(secret));
        if (!value || typeof value !== "object") return false;
        return Object.entries(value).some(([key, child]) => contains(key) || contains(child));
      }
      for (const value of redactValues) result.body = scrubProtectedValue(result.body, value);
      let parsed: unknown = result.body;
      try {
        parsed = JSON.parse(result.body);
      } catch {
        /* Plain-text responses remain bounded data. */
      }
      if (contains(result.body) || contains(parsed))
        throw new OpenApiTransportError("REQUEST_FAILED");
      return result;
    } catch (error) {
      if (timedOut) throw new OpenApiTransportError("TIMED_OUT");
      if (parent.aborted) throw parent.reason ?? new OpenApiTransportError("REQUEST_FAILED");
      if (error instanceof OpenApiTransportError) throw error;
      if (error instanceof RemoteEndpointError) throw new OpenApiTransportError("INVALID_ENDPOINT");
      throw new OpenApiTransportError("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", stop);
      controller.abort();
    }
  }
  async function readWeather(headers: Record<string, string>, args: unknown, signal: AbortSignal) {
    const input = weatherArguments(args);
    if (!input) throw new OpenApiTransportError("INVALID_ARGUMENTS");
    const key = headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    try {
      return await lookupWeather(
        input,
        key,
        async (target) => {
          const response = await perform(
            target,
            "GET",
            {},
            undefined,
            signal,
            false,
            key ? [key] : [],
          );
          return JSON.parse(response.body) as unknown;
        },
        options.now?.(),
      );
    } catch (error) {
      if (signal.aborted || error instanceof OpenApiTransportError) throw error;
      throw new OpenApiTransportError("REQUEST_FAILED");
    }
  }
  return {
    validate(url) {
      try {
        validateRemoteEndpoint(url);
      } catch {
        throw new OpenApiTransportError("INVALID_ENDPOINT");
      }
    },
    async fetchDocument(url, signal) {
      return (await perform(validateRemoteEndpoint(url), "GET", {}, undefined, signal)).body;
    },
    async test(url, headers, signal, preset) {
      if (preset === "tavily" && url === WEB_SEARCH_API_URL) {
        await perform(new URL("/usage", url), "GET", headers, undefined, signal);
        return;
      }
      if (preset === "open-meteo" && url === WEATHER_API_URL) {
        const result = await readWeather(
          headers,
          { city: "Berlin, Germany", countryCode: "DE" },
          signal,
        );
        if (!result.forecast) throw new OpenApiTransportError("REQUEST_FAILED");
        return;
      }
      await perform(validateRemoteEndpoint(url), "HEAD", headers, undefined, signal);
    },
    async call(url, headers, operation, args, signal, protectedInput) {
      if (isWeatherOperation(url, operation)) {
        const result = await readWeather(headers, args, signal);
        return {
          status: 200,
          content: JSON.stringify(result),
          truncated: false,
          isError: !result.forecast,
        };
      }
      if (JSON.stringify(args).length > 40000 || !matchesOpenApiSchema(args, operation.inputSchema))
        throw new OpenApiTransportError("INVALID_ARGUMENTS");
      const base = validateRemoteEndpoint(url);
      let path = operation.path;
      const pathValues = (args.path ?? {}) as Record<string, unknown>;
      for (const parameter of operation.parameters.filter((param) => param.in === "path")) {
        const value = String(pathValues[parameter.name]);
        if (value === "." || value === "..") throw new OpenApiTransportError("INVALID_ARGUMENTS");
        path = path.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
      }
      const target = new URL(base);
      target.pathname = `${base.pathname.replace(/\/$/, "")}${path}`;
      if (
        target.origin !== base.origin ||
        !target.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
      )
        throw new OpenApiTransportError("INVALID_ENDPOINT");
      const queryValues = (args.query ?? {}) as Record<string, unknown>;
      for (const parameter of operation.parameters.filter((param) => param.in === "query"))
        if (queryValues[parameter.name] !== undefined)
          target.searchParams.set(parameter.name, String(queryValues[parameter.name]));
      if (protectedInput?.query)
        target.searchParams.set(protectedInput.query.name, protectedInput.query.value);
      const webTool = tavilyToolName(url, operation);
      const readUrl =
        webTool === "web_read"
          ? tavilyPublicUrl((args.body as { urls?: string[] } | undefined)?.urls?.[0])
          : undefined;
      if (webTool === "web_read" && !readUrl) throw new OpenApiTransportError("INVALID_ARGUMENTS");
      const result = await perform(
        target,
        operation.method,
        headers,
        args.body === undefined ? undefined : JSON.stringify(args.body),
        signal,
        true,
        protectedInput?.protectedValues,
        readUrl,
      );
      if (webTool && result.status >= 200 && result.status < 300) {
        let normalized: ReturnType<typeof tavilyResult>;
        try {
          normalized = tavilyResult(webTool, JSON.parse(result.body));
        } catch {
          // Malformed responses are a stable failed read.
        }
        if (!normalized)
          return { status: result.status, content: "", truncated: false, isError: true };
        return {
          status: result.status,
          content: JSON.stringify(normalized),
          truncated: false,
          isError: false,
        };
      }
      return {
        status: result.status,
        content: result.body.slice(0, 12000),
        truncated: result.body.length > 12000,
        isError: result.status < 200 || result.status >= 300,
      };
    },
  };
}
