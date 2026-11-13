import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { z } from "zod";
import { mcpProtectedValues } from "./credentials.js";
import type {
  McpCallResult,
  McpConnection,
  McpHeaders,
  McpRemoteTool,
  McpTransport,
} from "./port.js";
import {
  McpTransportError,
  resolveMcpEndpoint,
  validateMcpEndpoint,
  type McpResolver,
  type ResolvedEndpoint,
} from "./url.js";

const RESPONSE_BYTES = 262_144;
const RESULT_CHARACTERS = 12_000;
const TIMEOUT_MS = 10_000;
const toolSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  description: z.string().max(4000).optional(),
  inputSchema: z
    .record(z.string(), z.unknown())
    .refine((value) => value.type === "object" && JSON.stringify(value).length <= 16_384),
  annotations: z.object({ readOnlyHint: z.boolean().optional() }).optional(),
});
interface HttpReply {
  status: number;
  headers: Headers;
  body: string | ReadableStream<Uint8Array>;
}
export interface McpTransportOptions {
  resolver?: McpResolver;
  /** Injection occurs below endpoint admission, so tests exercise DNS/redirect checks. */
  request?: (
    endpoint: ResolvedEndpoint,
    headers: McpHeaders,
    body: string,
    signal: AbortSignal,
  ) => Promise<HttpReply>;
  timeoutMs?: number;
}
function request(
  endpoint: ResolvedEndpoint,
  headers: McpHeaders,
  body: string,
  signal: AbortSignal,
): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const send = endpoint.url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      endpoint.url,
      {
        method: "POST",
        headers,
        signal,
        agent: false,
        // The TLS hostname and HTTP Host stay original; DNS is pinned to the address
        // admitted for this exact request. No second, unchecked resolution occurs.
        lookup(_hostname, _options, callback) {
          callback(null, endpoint.address, endpoint.family);
        },
      },
      (response) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined)
            responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        let size = 0;
        let ended = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            response.on("data", (chunk: Buffer) => {
              if (ended) return;
              size += chunk.byteLength;
              if (size > RESPONSE_BYTES) {
                ended = true;
                controller.error(new McpTransportError("REQUEST_FAILED"));
                req.destroy();
                return;
              }
              controller.enqueue(new Uint8Array(chunk));
            });
            response.once("error", () => {
              if (!ended) {
                ended = true;
                controller.error(new McpTransportError("REQUEST_FAILED"));
              }
            });
            response.once("end", () => {
              if (!ended) {
                ended = true;
                controller.close();
              }
            });
          },
          cancel() {
            ended = true;
            req.destroy();
          },
        });
        resolve({ status: response.statusCode ?? 500, headers: responseHeaders, body: stream });
      },
    );
    req.once("error", () => reject(new McpTransportError("REQUEST_FAILED")));
    req.end(body);
  });
}
function rejectsCredentialEcho(value: unknown, headers: McpHeaders): void {
  const protectedValues = mcpProtectedValues(headers);
  function contains(candidate: unknown): boolean {
    if (typeof candidate === "string")
      return protectedValues.some((secret) => candidate.includes(secret));
    if (Array.isArray(candidate)) return candidate.some(contains);
    if (!candidate || typeof candidate !== "object") return false;
    return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
  }
  if (contains(value)) throw new McpTransportError("REQUEST_FAILED");
}
/** Official SDK, loaded only when an operation actually needs a connection. */
export function createMcpTransport(options: McpTransportOptions = {}): McpTransport {
  const send = options.request ?? request;
  async function session<T>(
    connection: McpConnection,
    parentSignal: AbortSignal,
    operation: (
      client: import("@modelcontextprotocol/client").Client,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    const sdk = await import("@modelcontextprotocol/client");
    const controller = new AbortController();
    let timedOut = false;
    const stop = () => controller.abort();
    parentSignal.addEventListener("abort", stop, { once: true });
    if (parentSignal.aborted) stop();
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs ?? TIMEOUT_MS);
    function abortable<R>(promise: Promise<R>): Promise<R> {
      return new Promise<R>((resolve, reject) => {
        const abort = () =>
          reject(new McpTransportError(timedOut ? "TIMED_OUT" : "REQUEST_FAILED"));
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        void promise
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener("abort", abort));
      });
    }
    const client = new sdk.Client({ name: "raypx", version: "1" }, { capabilities: {} });
    // GET notifications and resumption are deliberately unsupported. Each bounded
    // request uses its POST response; effect recovery is owned by the Run engine.
    const safeFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method !== "POST") return new Response(null, { status: 405 });
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const body = typeof init?.body === "string" ? init.body : "";
      const requestSignal = init?.signal
        ? AbortSignal.any([controller.signal, init.signal])
        : controller.signal;
      for (let redirects = 0; redirects <= 3; redirects++) {
        requestSignal.throwIfAborted();
        const endpoint = await abortable(resolveMcpEndpoint(url, options.resolver));
        const reply = await abortable(send(endpoint, headers, body, requestSignal));
        if (reply.status >= 300 && reply.status < 400) {
          if (reply.status !== 307 && reply.status !== 308)
            throw new McpTransportError("INVALID_ENDPOINT");
          if (redirects === 3) throw new McpTransportError("INVALID_ENDPOINT");
          const location = reply.headers.get("location");
          if (typeof reply.body !== "string") await reply.body.cancel();
          if (!location) throw new McpTransportError("INVALID_ENDPOINT");
          const redirected = await abortable(
            resolveMcpEndpoint(new URL(location, endpoint.url).href, options.resolver),
          );
          if (redirected.url.origin !== new URL(connection.url).origin)
            throw new McpTransportError("INVALID_ENDPOINT");
          url = redirected.url.href;
          continue;
        }
        if (reply.status === 401 || reply.status === 403)
          throw new McpTransportError("AUTHENTICATION_FAILED");
        if (reply.status === 429) throw new McpTransportError("RATE_LIMITED");
        if (reply.status < 200 || reply.status >= 300)
          throw new McpTransportError("REQUEST_FAILED");
        if (
          typeof reply.body === "string" &&
          Buffer.byteLength(reply.body, "utf8") > RESPONSE_BYTES
        )
          throw new McpTransportError("REQUEST_FAILED");
        return new Response(reply.body || null, { status: reply.status, headers: reply.headers });
      }
      throw new McpTransportError("INVALID_ENDPOINT");
    };
    const transport = new sdk.StreamableHTTPClientTransport(new URL(connection.url), {
      fetch: safeFetch,
      requestInit: { headers: connection.headers, redirect: "manual" },
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
      },
    });
    try {
      await abortable(
        client.connect(transport, {
          signal: controller.signal,
          timeout: options.timeoutMs ?? TIMEOUT_MS,
        }),
      );
      return await abortable(operation(client, controller.signal));
    } catch (error) {
      if (timedOut) throw new McpTransportError("TIMED_OUT");
      if (parentSignal.aborted) throw parentSignal.reason ?? new Error("MCP_CANCELLED");
      if (error instanceof McpTransportError) throw error;
      throw new McpTransportError("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", stop);
      controller.abort();
      await client.close().catch(() => {});
    }
  }
  return {
    validate(url) {
      validateMcpEndpoint(url);
    },
    listTools(connection, signal) {
      return session(connection, signal, async (client, requestSignal) => {
        const result: McpRemoteTool[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 8; page++) {
          // Request one page explicitly; the convenience listTools method may
          // auto-aggregate an unbounded server-controlled pagination sequence.
          const reply = await client.request(
            { method: "tools/list", params: cursor ? { cursor } : {} },
            { signal: requestSignal },
          );
          rejectsCredentialEcho(reply, connection.headers);
          const parsed = z
            .object({
              tools: z.array(toolSchema).max(128),
              nextCursor: z.string().min(1).max(512).optional(),
            })
            .parse(reply);
          for (const item of parsed.tools) {
            if (result.some((tool) => tool.name === item.name))
              throw new McpTransportError("REQUEST_FAILED");
            result.push({
              name: item.name,
              description: item.description ?? "Remote tool",
              inputSchema: item.inputSchema,
              readOnly: item.annotations?.readOnlyHint === true,
            });
          }
          if (result.length > 128) throw new McpTransportError("TOOL_LIMIT");
          if (!parsed.nextCursor) return result.sort((a, b) => a.name.localeCompare(b.name));
          cursor = parsed.nextCursor;
        }
        throw new McpTransportError("TOOL_LIMIT");
      });
    },
    callTool(connection, name, args, signal): Promise<McpCallResult> {
      return session(connection, signal, async (client, requestSignal) => {
        // No SDK auto-refresh/retry or server-controlled output-schema compiler.
        const result = await client.request(
          { method: "tools/call", params: { name, arguments: args } },
          { signal: requestSignal },
        );
        rejectsCredentialEcho(result, connection.headers);
        const content = JSON.stringify(result.content ?? []);
        const truncated = content.length > RESULT_CHARACTERS;
        return {
          content: content.slice(0, RESULT_CHARACTERS),
          isError: result.isError === true,
          truncated,
        };
      });
    },
  };
}
