import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

// A real oRPC 2 router with opaque JSON inputs; no database or account service.
const jsonInput = {
  "~standard": {
    version: 1 as const,
    vendor: "raypx-protocol-fixture",
    validate: (value: unknown) => ({ value }),
  },
};
const base = os.$context<{ request: Request }>().input(jsonInput);
const field = (value: unknown, key: string) =>
  value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
const secret = "fixture-private-cookie";
const credential = "fixture-native-host-credential";
const router = {
  account: {
    get: base.handler(({ input, context }) => {
      const mode = field(input, "mode");
      if (mode === "unauthorized")
        throw new ORPCError("UNAUTHORIZED", { message: "private-server-detail-must-not-escape" });
      if (mode === "not-found")
        throw new ORPCError("NOT_FOUND", { message: "private-server-detail-must-not-escape" });
      if (mode === "forged-error")
        throw new ORPCError("RAYPX_API_TRANSPORT", {
          message: "private-server-detail-must-not-escape",
        });
      if (mode === "date") return { createdAt: new Date("2026-01-01T00:00:00.000Z") };
      return {
        id: "fixture-account",
        authenticated:
          context.request.headers.get("cookie")?.includes(`better-auth.fixture=${secret}`) === true,
      };
    }),
  },
  hosts: {
    authorize: base.handler(({ context, input }) => {
      const deviceId = field(input, "deviceId");
      if (deviceId === "unauthorized")
        throw new ORPCError("UNAUTHORIZED", { message: "private-server-detail-must-not-escape" });
      if (deviceId === "not-found")
        throw new ORPCError("NOT_FOUND", { message: "private-server-detail-must-not-escape" });
      if (deviceId === "forbidden")
        throw new ORPCError("FORBIDDEN", { message: "private-server-detail-must-not-escape" });
      if (!context.request.headers.get("cookie")?.includes(`better-auth.fixture=${secret}`))
        throw new ORPCError("UNAUTHORIZED");
      return { credential, deviceId, epoch: field(input, "epoch") };
    }),
    revoke: base.handler(({ input }) => {
      if (field(input, "credential") !== credential) throw new ORPCError("BAD_REQUEST");
      return { revoked: true };
    }),
  },
};
const handler = new RPCHandler(router);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.headers.get("origin") !== "views://main")
      return new Response("Unexpected native Origin", { status: 400 });
    if (new URL(request.url).pathname === "/rpc/hosts/authorize") {
      const wire: unknown = await request.clone().json();
      const deviceId = field(field(wire, "json"), "deviceId");
      if (deviceId === "legacy") return new Response("Not found", { status: 404 });
      if (deviceId === "redirect")
        return Response.json(
          { json: { credential: "redirect-must-not-be-accepted" } },
          { status: 302, headers: { location: "https://external.example.test" } },
        );
    }
    const result = await handler.handle(request, { prefix: "/rpc", context: { request } });
    if (!result.matched) return new Response("Not found", { status: 404 });
    const headers = new Headers(result.response.headers);
    if (new URL(request.url).pathname === "/rpc/account/get")
      headers.set("set-cookie", `better-auth.fixture=${secret}; Path=/; HttpOnly; Max-Age=3600`);
    return new Response(result.response.body, { status: result.response.status, headers });
  },
});
console.info(JSON.stringify({ origin: server.url.origin }));
