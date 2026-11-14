/** Non-executing HTTP fixture used only by the explicitly owned browser backend. */
export function browserOpenApiFixture() {
  let changes = 0;
  return function response(request: Request): Response {
    const url = new URL(request.url);
    const basePath = "/fixture/httpapi";
    if (url.pathname === `${basePath}/schema`) {
      return Response.json({
        openapi: "3.1.0",
        info: { title: "Fixture inventory", version: "1.0.0" },
        servers: [{ url: `${url.origin}${basePath}` }],
        paths: {
          "/protected": {
            post: {
              operationId: "protectedCall",
              summary: "Authenticate once",
              responses: { "200": { description: "Authenticated" } },
            },
          },
          "/items/{id}": {
            get: {
              operationId: "getItem",
              summary: "Read inventory item",
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
              responses: { "200": { description: "An inventory item" } },
            },
          },
          "/items": {
            post: {
              operationId: "createItem",
              summary: "Create inventory item",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { name: { type: "string" } },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
              },
              responses: { "201": { description: "Created inventory item" } },
            },
          },
        },
      });
    }
    if (request.method === "HEAD" && url.pathname === basePath)
      return new Response(null, { status: 204 });
    if (url.pathname === `${basePath}/protected` && request.method === "POST") {
      const authorization = request.headers.get("authorization");
      const value =
        request.headers.get("x-call-key") ??
        url.searchParams.get("api_key") ??
        (authorization?.startsWith("Basic ")
          ? Buffer.from(authorization.slice(6), "base64").toString()
          : authorization?.replace(/^Bearer /, ""));
      if (!value) return new Response(null, { status: 401 });
      return Response.json({ delivered: true, encodedEcho: Buffer.from(value).toString("base64") });
    }
    if (request.headers.get("authorization") !== "Bearer fixture-api-credential")
      return new Response(null, { status: 401 });
    if (request.method === "GET" && url.pathname === `${basePath}/items/fixture`)
      return Response.json({ id: "fixture", name: "Fixture item", changes });
    if (request.method === "POST" && url.pathname === `${basePath}/items`) {
      changes++;
      return Response.json({ id: "created", name: "Fixture item", changes }, { status: 201 });
    }
    return new Response(null, { status: 404 });
  };
}
