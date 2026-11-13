import { describe, expect, it } from "vitest";
import { eventPolicy, parseAnalyticsConsent, analyticsPage } from "./index.js";
import { createQueryFailureReporter } from "./browser.js";
it("projects explicit enums and never forwards task content or raw URLs", () => {
  expect(
    eventPolicy("page_viewed", {
      page: "agents",
      prompt: "private",
      path: "/Users/private",
      id: "private-id",
    }),
  ).toEqual({ page: "agents" });
  expect(eventPolicy("page_viewed", { page: "/reset-password?token=secret" })).toEqual({
    page: "other",
  });
  expect(eventPolicy("unknown", {})).toBeNull();
  expect(parseAnalyticsConsent({ usage: "true", errors: true })).toEqual({
    usage: false,
    errors: true,
  });
  expect(analyticsPage("/", "desktop")).toBe("agents");
  expect(analyticsPage("/", "web")).toBe("home");
  expect(analyticsPage("/agents")).toBe("agents");
  expect(analyticsPage("/memory")).toBe("memory");
  for (const path of ["/projects", "/tasks", "/approvals", "/automations", "/files", "/terminal"])
    expect(analyticsPage(path, "desktop")).toBe("other");
  expect(eventPolicy("task_create_result", {})).toBeNull();
});
describe("query failures", () => {
  it("keeps only the query family, safe code and a well-formed request ID", () => {
    expect(
      eventPolicy("query_failed", {
        query: "account",
        code: "DEVICE_OFFLINE",
        requestId: "req_abcdefghijklmnopqrstuvwx",
        path: "/secret",
      }),
    ).toEqual({
      query: "account",
      code: "DEVICE_OFFLINE",
      requestId: "req_abcdefghijklmnopqrstuvwx",
    });
    expect(
      eventPolicy("query_failed", { query: "private-notes", code: "boom", requestId: "a@b.c" }),
    ).toEqual({ query: "other", code: "UNEXPECTED_ERROR" });
  });

  it("reports each failing query family at most once per interval", () => {
    const captured: unknown[] = [];
    const report = createQueryFailureReporter(
      {
        capture: (event: string, properties: unknown) => captured.push([event, properties]),
      } as never,
      60_000,
    );
    const error = {
      data: { error: { code: "NETWORK_UNAVAILABLE" }, requestId: "req_abcdefghijklmnopqrstuvwx" },
    };
    report(error, ["account", 1, "workspace"]);
    report(error, ["account", 1, "devices"]);
    expect(captured).toEqual([
      [
        "query_failed",
        {
          query: "account",
          code: "NETWORK_UNAVAILABLE",
          requestId: "req_abcdefghijklmnopqrstuvwx",
        },
      ],
    ]);
  });
});
