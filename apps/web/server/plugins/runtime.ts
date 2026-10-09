import { definePlugin } from "nitro";
import { withHttpRequest, getRequestContext } from "@raypx/api/http";
import { runtime, runtimeLogger } from "../../src/server/runtime.server";

/** Runs before the production listener is created, including direct artifact execution. */
export default definePlugin((app) => {
  const fetch = app.fetch.bind(app);
  app.fetch = (request) =>
    withHttpRequest(request, ({ requestId }) => {
      const headers = new Headers(request.headers);
      headers.set("x-request-id", requestId);
      return fetch(new Request(request, { headers }));
    });
  app.hooks.hook("error", (error) => {
    runtimeLogger.error("Framework request failed", {
      error,
      requestId: getRequestContext()?.requestId,
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
