import { describe, expect, it, vi } from "vite-plus/test";
import type { TaskClient } from "@raypx/client";
import { createNoopAnalytics } from "@raypx-kit/analytics";
import { eventPolicy, parseAnalyticsConsent, analyticsPage } from "../../src/index";
import {
  instrumentTaskClient,
  createRaypxAnalytics,
  createQueryFailureReporter,
} from "../../src/browser";
it("projects explicit enums and never forwards task content or raw URLs", () => {
  expect(
    eventPolicy("task_create_result", {
      scope: "local",
      provider: "codex",
      outcome: "accepted",
      prompt: "private",
      path: "/Users/private",
      id: "private-id",
    }),
  ).toEqual({ scope: "local", provider: "codex", outcome: "accepted" });
  expect(eventPolicy("page_viewed", { page: "/reset-password?token=secret" })).toEqual({
    page: "other",
  });
  expect(eventPolicy("unknown", {})).toBeNull();
  expect(parseAnalyticsConsent({ usage: "true", errors: true })).toEqual({
    usage: false,
    errors: true,
  });
  expect(analyticsPage("/", "desktop")).toBe("files");
  expect(analyticsPage("/automations", "desktop")).toBe("jobs");
});
it("records mutation responses once per attempt while reads and raw arguments stay private", async () => {
  const analytics = { ...createNoopAnalytics(), capture: vi.fn() };
  const result = { id: "private-id" };
  const create = vi.fn().mockResolvedValue(result);
  const client = {
    tasks: { create, list: vi.fn().mockResolvedValue([]) },
    devices: { list: vi.fn() },
    approvals: { decide: vi.fn().mockResolvedValue({}) },
    subscribe: () => () => {},
  } as unknown as TaskClient;
  const wrapped = instrumentTaskClient(client, analytics, "local");
  const input = {
    id: "private-id",
    deviceId: "private-device",
    projectId: "private-project",
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "private-content",
  };
  expect(await wrapped.tasks.create(input)).toBe(result);
  await wrapped.tasks.list({ limit: 100 });
  expect(analytics.capture.mock.calls).toEqual([
    ["task_create_result", { scope: "local", provider: "codex", outcome: "accepted" }],
  ]);
  const error = new Error("/Users/private bad output");
  create.mockRejectedValueOnce(error);
  await expect(wrapped.tasks.create(input)).rejects.toBe(error);
  expect(analytics.capture).toHaveBeenLastCalledWith("task_create_result", {
    scope: "local",
    provider: "codex",
    outcome: "failed",
    code: "UNEXPECTED_ERROR",
  });
});
it("drops late mutation diagnostics after an account change without changing the result", async () => {
  const analytics = createRaypxAnalytics({
    token: "",
    host: "",
    release: "test",
    environment: "test",
    surface: "desktop",
  });
  analytics.setConsent({ usage: true, errors: false });
  analytics.identify("account-a");
  const capture = vi.spyOn(analytics, "capture");
  let resolve!: (value: unknown) => void;
  const client = {
    tasks: {
      create: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
    approvals: {},
    devices: {},
    subscribe: () => () => {},
  } as unknown as TaskClient;
  const wrapped = instrumentTaskClient(client, analytics, "local");
  const result = { id: "private-task" };
  const pending = wrapped.tasks.create({
    id: "id",
    deviceId: "device",
    projectId: "project",
    provider: "codex",
    mode: "run",
    prompt: "private",
  });
  analytics.identify("account-b");
  resolve(result);
  expect(await pending).toBe(result);
  expect(capture).not.toHaveBeenCalled();
  analytics.dispose();
});

describe("query failures", () => {
  it("keeps only the query family, safe code and a well-formed request ID", () => {
    expect(
      eventPolicy("query_failed", {
        query: "tasks",
        code: "DEVICE_OFFLINE",
        requestId: "req_abcdefghijklmnopqrstuvwx",
        path: "/secret",
      }),
    ).toEqual({
      query: "tasks",
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
    report(error, ["tasks", 1, "workspace"]);
    report(error, ["tasks", 1, "devices"]);
    expect(captured).toEqual([
      [
        "query_failed",
        { query: "tasks", code: "NETWORK_UNAVAILABLE", requestId: "req_abcdefghijklmnopqrstuvwx" },
      ],
    ]);
  });
});
