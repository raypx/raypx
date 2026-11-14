# HTTP API and OpenAPI

The API and combined backend roles serve Swagger UI at `/api/docs` and the same
generated OpenAPI 3.1 document at `/api/openapi.json`. Both use the API's existing
Compose and Railway routes. Use **Try it out** from the reference page to send
same-origin requests, or import the JSON into another OpenAPI client.
Swagger UI assets are included in the API build.

- Hono defines and documents `GET /health` and `GET /ready`, including the
  dependency failure response from `/ready`.
- oRPC serves selected reads under `/api/v1/*` and generates their schemas
  from the same Zod contracts used by `/rpc/*`. The versioned HTTP endpoints
  use `GET` with no request body and return plain JSON. Resource IDs go in the
  path, and filters and pagination go in the query string. The RPC SDK
  continues to use its existing `/rpc/*` transport.

To add a read to the versioned API, use `httpRead` beside its input and output
schemas in `@raypx/contracts`. Give it a resource path such as `/tasks/{id}`.
The generator and HTTP handler select procedures by the same oRPC metadata.
`apps/api/src/routers/openapi.ts` adds the Hono health paths to the generated document.

```sh
curl -fsS "$RAYPX_API_URL/api/openapi.json"
curl -fsS "$RAYPX_API_URL/api/v1/configuration"
```

Public configuration requires no session. Account access accepts guests and
returns server-derived grants. The other documented reads require the existing
Better Auth session cookie and the same permissions and rate limits as RPC.
Sign in on the same origin before trying session-protected operations in the
browser. The browser sends its existing session cookie with the request.
Session cookies are `better-auth.session_token` in local HTTP development and
`__Secure-better-auth.session_token` in production HTTPS. The OpenAPI JSON contains
schemas only. Resource responses under `/api/v1/*` use `Cache-Control: no-store`.
`HEAD` returns the status and headers of `GET` without a body. An unsupported
method on a known resource returns `405` with an `Allow` header.

The versioned adapter covers account/configuration and retained device-task,
approval, observed-request, cloud-job and account-memory reads. It is not the
complete server Agent API. Current clients use `/rpc` for Space/Agent management,
history, Runs, approvals/effects, routines, Space memory, Pages and resources, plus
the acknowledged `/events` stream. Page documents use independent read-only
`/page-content/*` routes. Better Auth, Relay WebSockets, enrollment, credential
issuance, writes and local IPC retain their existing interfaces. Relay-only
instances continue to serve their own health probes.
