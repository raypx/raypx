# @raypx/api

Server business and HTTP foundations, independent of TanStack Start and port listening.

- `@raypx/api/health`: lightweight liveness, readiness for registered resources, and contract-based API 404 responses.
- `@raypx/api/http`: `withHttpRequest`, `getRequestContext`, `HttpError`, `errorResponse` and `parseJsonBody`.
- `@raypx/api/runtime`: `RuntimeLifecycle` and the resource check/dispose interface.

The web server adapter wraps HTTP and SSR requests once. A validated or generated `x-request-id` is returned and shared with access/error logs. Unexpected errors return a safe public message; business failures use the `contracts/errors` code and field-error schema. `parseJsonBody(request, schema)` validates external JSON before business code runs.

Wrap each API adapter before handing it to the framework. Nested wrappers reuse the global request context and produce one access log, while preserving deliberate errors before the framework catches them:

```ts
// Application .server.ts adapter; schema comes from the contracts package.
import { HttpError, parseJsonBody, withHttpRequest } from "@raypx/api/http";
import { createItemSchema } from "@raypx/contracts/items";

export const createItem = ({ request }: { request: Request }) =>
  withHttpRequest(request, async ({ logger }) => {
    const input = await parseJsonBody(request, createItemSchema);
    if (!canCreate(input)) throw new HttpError("FORBIDDEN");
    const item = await saveItem(input);
    logger.info("Item created", { itemId: item.id });
    return Response.json(item, { status: 201 });
  });
```

The example assumes application-specific `canCreate`, `saveItem`, and a new contracts schema. The existing health adapters demonstrate the complete wiring. Keep server imports in `.server.ts` files and use the JSON client transport from browser code.

The runtime registers only initialized resources. Required checks affect readiness; optional failures are reported without making the service unavailable. Probes have a deadline. Shutdown marks readiness unavailable and disposes resources once in reverse creation order within a total deadline.

The initial app does not initialize unused database, auth, cache or worker providers. As those features are enabled, register their real checks and cleanup in the application composition root. Request observers and logging failures cannot alter successful business responses.
