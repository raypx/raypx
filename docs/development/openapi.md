# HTTP API and OpenAPI

This guide describes Raypx's versioned HTTP API. Space owners can separately
register external OpenAPI operations as Agent tools through Web/Desktop Tools;
see [Space HTTP APIs](../architecture/capabilities.md#space-http-apis) for imports,
credentials, availability, egress bounds and approval/effect behavior. Mobile
shows those tools' activity and addressed approvals.

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
curl -fsS "$API_ORIGIN/api/openapi.json"
curl -fsS "$API_ORIGIN/api/v1/configuration"
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

The versioned adapter exposes only the explicit current read-only account,
configuration and Space/resource procedures selected by the API router. Writes,
credential exchange and private connector transports remain on their owning
boundaries.
