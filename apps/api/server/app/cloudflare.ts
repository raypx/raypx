import { createCloudflareRuntime, type CloudflareBindings } from "../runtime/cloudflare.js";
import type { ApiRuntime } from "../runtime/shared.js";

export interface CloudflareRequest extends Request {
  runtime?: {
    cloudflare?: {
      env: CloudflareBindings;
      context?: { waitUntil(task: Promise<unknown>): void };
    };
  };
}

export function createCloudflareApp(
  createRuntime: (
    bindings: CloudflareBindings,
  ) => Promise<Pick<ApiRuntime, "app" | "close">> = createCloudflareRuntime,
) {
  return {
    async fetch(request: CloudflareRequest): Promise<Response> {
      const cloudflare = request.runtime?.cloudflare;
      if (new URL(request.url).pathname === "/relay") {
        if (!cloudflare?.env.RAYPX_RELAY) return new Response(null, { status: 503 });
        const origin = request.headers.get("origin"),
          origins = cloudflare.env.ALLOWED_ORIGINS,
          allowed = (typeof origins === "string" ? origins : "")
            .split(",")
            .map((value) => value.trim());
        if (origin && !allowed.includes(origin)) return new Response(null, { status: 403 });
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
          return new Response(null, { status: 426 });
        const account = new URL(request.url).searchParams.get("account");
        if (!account || account.length > 200) return new Response(null, { status: 400 });
        return cloudflare.env.RAYPX_RELAY.getByName(account).fetch(request);
      }
      let runtime: Pick<ApiRuntime, "app" | "close"> | undefined;
      let requestId: string | undefined;
      try {
        if (!cloudflare) throw new Error("Cloudflare request context is unavailable");
        runtime = await createRuntime(cloudflare.env);
        const response = await runtime.app.fetch(request);
        requestId = response.headers.get("x-request-id") ?? undefined;
        return response;
      } catch {
        requestId ??= crypto.randomUUID();
        // Initialization errors can contain configuration values; never print them.
        console.error(JSON.stringify({ operation: "api.initialize", requestId, status: 500 }));
        return Response.json(
          { error: { code: "INTERNAL_SERVER_ERROR" }, requestId },
          { status: 500, headers: { "x-request-id": requestId } },
        );
      } finally {
        if (runtime) {
          const cleanup = runtime.close().catch(() => {
            console.error(JSON.stringify({ operation: "api.cleanup", requestId, status: 500 }));
          });
          if (cloudflare?.context) cloudflare.context.waitUntil(cleanup);
          else await cleanup;
        }
      }
    },
  };
}

export default createCloudflareApp();
