import { describe, expect, it } from "vite-plus/test";
import type { SafeEvent } from "@raypx-kit/logger/safe";
import { withErrorReports } from "../../server/error-reports.js";
import { newRequestId } from "../../server/api.js";

const base = { timestamp: "2026-10-22T00:00:00.000Z", service: "raypx-api", environment: "test" };
const logEvent = (fields: Record<string, unknown>) =>
  ({ ...base, ...fields }) as unknown as SafeEvent;

describe("API error reports", () => {
  it("sends only safe fields of failed requests to PostHog and still logs every event", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const logged: SafeEvent[] = [];
    const sink = withErrorReports(({ event }) => void logged.push(event), {
      token: "phc_test",
      host: "https://us.i.posthog.com/",
      environment: "production",
      fetch: async (url, init) => {
        sent.push({ url, body: JSON.parse(init.body as string) });
        return new Response(null);
      },
    });
    await sink({ event: logEvent({ level: "info", status: 200, operation: "http.request" }) });
    await sink({
      event: logEvent({
        level: "error",
        status: 500,
        operation: "rpc.request",
        route: "/rpc/*",
        requestId: "req_abc",
        error: { name: "TypeError", code: "UNEXPECTED" },
      }),
    });
    await sink.flush?.();
    expect(logged).toHaveLength(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(sent[0]?.body).toMatchObject({
      api_key: "phc_test",
      event: "$exception",
      properties: {
        $exception_list: [{ type: "TypeError", value: "UNEXPECTED" }],
        route: "/rpc/*",
        status: 500,
        requestId: "req_abc",
        environment: "production",
      },
    });
  });

  it("never fails logging when PostHog is unreachable", async () => {
    const sink = withErrorReports(() => {}, {
      token: "phc_test",
      host: "https://us.i.posthog.com",
      environment: "production",
      fetch: async () => {
        throw new Error("offline");
      },
    });
    await sink({ event: logEvent({ level: "error", status: 503 }) });
    await expect(sink.flush?.()).resolves.toBeUndefined();
  });

  it("creates letter-only request IDs that log redaction cannot mask", () => {
    const id = newRequestId();
    expect(id).toMatch(/^req_[a-z]{24}$/);
    expect(newRequestId()).not.toBe(id);
  });
});
