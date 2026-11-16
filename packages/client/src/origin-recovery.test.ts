import { afterEach, expect, it, vi } from "vitest";
import { OriginRecovery, retryAfterMs } from "./origin-recovery.js";

afterEach(() => vi.useRealTimers());
it("coalesces failed session mounts, focus reads and streams under one Retry-After deadline", async () => {
  vi.useFakeTimers();
  const transport = vi.fn(
    async (_input: string, _init?: RequestInit) =>
      new Response(null, { status: 429, headers: { "X-Retry-After": "45" } }),
  );
  const recovery = new OriginRecovery("https://api.test", transport);
  await recovery.fetch("https://api.test/api/auth/get-session");
  for (let i = 0; i < 100; i++) await recovery.fetch("https://api.test/api/rpc/account/access");
  await vi.advanceTimersByTimeAsync(44_999);
  expect(transport).toHaveBeenCalledOnce();
  transport.mockResolvedValue(new Response(null, { headers: { "x-raypx-service": "api" } }));
  await vi.advanceTimersByTimeAsync(1);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]?.[0]).toBe("https://api.test/ready");
  expect(recovery.getSnapshot()).toBe("ready");
  recovery.dispose();
});
it("backs off with jitter, checks API readiness and never replays an uncertain mutation", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const transport = vi.fn(async (_input: string, _init?: RequestInit) => {
    throw new Error("offline");
  });
  const recovery = new OriginRecovery("https://api.test", transport);
  await expect(
    recovery.fetch("https://api.test/api/rpc/conversations/send", { method: "POST" }),
  ).rejects.toThrow("offline");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(transport.mock.calls.length).toBeLessThanOrEqual(7);
  expect(transport.mock.calls.slice(1).every(([path]) => path === "https://api.test/ready")).toBe(
    true,
  );
  recovery.dispose();
  vi.restoreAllMocks();
});
it("does not accept a Web fallback as readiness and does not pause on deliberate cancellation", async () => {
  vi.useFakeTimers();
  const transport = vi.fn(
    async (_input: string, _init?: RequestInit) =>
      new Response(null, { headers: { "x-raypx-service": "web" } }),
  );
  const recovery = new OriginRecovery("https://api.test", transport);
  recovery.pause();
  await vi.advanceTimersByTimeAsync(1500);
  expect(recovery.getSnapshot()).toBe("updating");
  recovery.dispose();
  const online = new OriginRecovery("https://api.test", transport);
  const abort = new AbortController();
  abort.abort();
  await expect(
    online.fetch("https://api.test/api/rpc/account/get", { signal: abort.signal }),
  ).rejects.toThrow(/abort/i);
  expect(online.getSnapshot()).toBe("ready");
});
it("keeps an admitted feature's unavailable result local while honoring explicit service draining", async () => {
  const transport = vi.fn(
    async () => new Response(null, { status: 503, headers: { "x-raypx-service": "api" } }),
  );
  const recovery = new OriginRecovery("https://api.test", transport);
  await recovery.fetch("https://api.test/api/rpc/configuration/testMail");
  expect(recovery.getSnapshot()).toBe("ready");
  transport.mockResolvedValue(
    new Response(null, {
      status: 503,
      headers: {
        "x-raypx-service": "api",
        "x-raypx-state": "updating",
        "retry-after": "3",
      },
    }),
  );
  await recovery.fetch("https://api.test/api/rpc/account/get");
  expect(recovery.getSnapshot()).toBe("updating");
  recovery.dispose();
});
it("honors both Retry-After formats and clamps invalid values", () => {
  expect(retryAfterMs(new Headers({ "Retry-After": "60" }))).toBe(60_000);
  expect(
    retryAfterMs(
      new Headers({ "Retry-After": "Mon, 16 Nov 2026 12:01:00 GMT" }),
      Date.parse("2026-11-16T12:00:00Z"),
    ),
  ).toBe(60_000);
  expect(retryAfterMs(new Headers({ "Retry-After": "invalid" }))).toBe(0);
});
