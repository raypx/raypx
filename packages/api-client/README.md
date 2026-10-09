# @raypx/api-client

Browser-safe, same-origin JSON transport. Depends only on `@raypx/contracts`; it does not import application routes or server implementations.

Public entrypoints are `@raypx/api-client/health`, `@raypx/api-client/http`, and `@raypx/api-client/errors`. The root entrypoint re-exports them.

```typescript
import { checkHealth } from "@raypx/api-client/health";
import { requestJson } from "@raypx/api-client/http";
import { healthResponseSchema } from "@raypx/contracts/health";

const controller = new AbortController();
const health = await checkHealth({ signal: controller.signal, timeoutMs: 5000 });
const retriedHealth = await requestJson({
  path: "/api/health",
  schema: healthResponseSchema,
  signal: controller.signal,
  retry: { maxRetries: 2, delayMs: 100 },
});
```

`requestJson({ path, schema, method?, body?, headers?, signal?, timeoutMs?, retry? })` requires an absolute same-origin path beginning with a single `/`. It sets `mode` and `credentials` to `same-origin`, requests JSON, and validates the response using the supplied `parse(unknown)` schema. JSON request bodies reject cycles, non-finite numbers, and non-JSON objects. GET and HEAD cannot contain bodies. HEAD passes `undefined` to the response schema because HTTP HEAD has no response body.

The default 5000 ms timeout covers the complete operation, including response reading and retry delays. Caller cancellation is preserved. Retry is disabled by default; explicit retries are limited to GET/HEAD, at most three retries and a delay of 0–1000 ms. Only network failures and HTTP 408, 429, 500, 502, 503, and 504 are retried. Invalid response contracts, cancellation, and timeouts are never retried. Writes cannot opt into retries.

```typescript
import { ApiClientError } from "@raypx/api-client/errors";

try {
  await checkHealth();
} catch (error) {
  if (error instanceof ApiClientError) {
    console.info(error.kind, error.code, error.status, error.requestId);
  }
}
```

`ApiClientError.kind` is `http`, `network`, `timeout`, `aborted`, `invalid-request`, or `invalid-response`. Valid server errors preserve their public `code`, `message`, field `errors`, and `requestId`; the `x-request-id` header is a fallback. Raw response bodies are never used as error messages. Non-JSON bodies, malformed JSON, and invalid success/error schemas are rejected. HEAD failures use the HTTP status and request ID header without requiring an error body. Timeout and cancellation errors retain the names `TimeoutError` and `AbortError`, with the original reason in `cause`.

The health helper keeps its existing `signal` and `timeoutMs` options and uses the shared transport. Readiness probes have a dedicated response contract, including HTTP 503, and should be consumed by infrastructure probes rather than this business JSON transport.

To add an endpoint, define its schema in `contracts`, implement the server route through `api` and the web server adapter, then add a client function calling `requestJson`. UI components receive data and callbacks; Hooks manage request lifecycle.
