import { definePlugin } from "nitro";
import { withHttpRequest, getRequestContext } from "@raypx/api/http";
import { createRateLimitGuard } from "@raypx/api/security";
import { runtime, runtimeLogger, services, requestRoute } from "../../src/server/runtime.server";

/** Runs before the production listener is created, including direct artifact execution. */
export default definePlugin((app) => {
  const fetch = app.fetch.bind(app);
  const rateLimitGuard = createRateLimitGuard({ limiter: services.limiter });
  app.fetch = (request) =>
    withHttpRequest(
      request,
      ({ requestId, signal }) => {
        const headers = new Headers(request.headers);
        headers.set("x-request-id", requestId);
        // Nitro dev may supply a Request facade without Undici's internal slots.
        const init: RequestInit & { duplex?: "half" } = {
          method: request.method,
          headers,
          signal,
          ...(request.body ? { body: request.body, duplex: "half" } : {}),
        };
        return fetch(new Request(request.url, init));
      },
      {
        route: requestRoute(new URL(request.url).pathname),
        observe: services.metrics.observe,
        observeLifecycle: services.metrics.observeLifecycle,
        guards: [
          (incoming, context) => {
            const path = new URL(incoming.url).pathname;
            if (
              path.startsWith("/api/") &&
              !["/api/health", "/api/ready", "/api/metrics"].includes(path)
            )
              return rateLimitGuard(incoming, context);
          },
        ],
      },
    );
  app.hooks.hook("error", (error) => {
    const context = getRequestContext();
    if (
      context?.signal.aborted &&
      (error === context.signal.reason || (error instanceof Error && error.name === "AbortError"))
    )
      return;
    runtimeLogger.error("Framework request failed", {
      error,
      requestId: context?.requestId,
    });
  });
  const drain = () => runtime.markDraining();
  process.once("SIGTERM", drain);
  process.once("SIGINT", drain);
  app.hooks.hook("close", async () => {
    await runtime.dispose();
    process.removeListener("SIGTERM", drain);
    process.removeListener("SIGINT", drain);
  });
  runtimeLogger.info("Runtime initialized");
});
