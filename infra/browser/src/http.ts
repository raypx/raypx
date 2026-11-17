import { timingSafeEqual } from "node:crypto";
import { browserCommandSchema } from "@raypx/core/browser";
import type { createBrowserBroker } from "./broker.js";

const failures = new Set([
  "BROWSER_BUSY",
  "BROWSER_CAPACITY",
  "BROWSER_CLOSED",
  "BROWSER_CONTROL_REQUIRED",
  "BROWSER_CONTROLLED",
  "BROWSER_DESTINATION_UNAVAILABLE",
  "BROWSER_FORM_CHANGED",
]);

export function browserBrokerFetch(broker: ReturnType<typeof createBrowserBroker>, token: string) {
  const authorization = Buffer.from(`Bearer ${token}`);
  return async (request: Request) => {
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization))
      return new Response(null, { status: 404 });
    const match = /^\/sessions\/([a-f0-9]{64})$/.exec(new URL(request.url).pathname);
    if (!match || request.method !== "POST") return new Response(null, { status: 404 });
    const command = browserCommandSchema.safeParse(await request.json().catch(() => undefined));
    if (!command.success) return new Response(null, { status: 400 });
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]);
      return Response.json(await broker.run(match[1]!, command.data, signal), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (failures.has(message)) return Response.json({ code: message }, { status: 409 });
      return Response.json({ code: "BROWSER_COMMAND_FAILED" }, { status: 502 });
    }
  };
}
