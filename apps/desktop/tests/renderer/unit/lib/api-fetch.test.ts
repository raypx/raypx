/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createDesktopFetch } from "../../../../src/lib/api-fetch";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  cancel: vi.fn(async () => true),
  native: true,
}));
vi.mock("../../../../src/lib/desktop", () => ({
  isDesktop: () => mocks.native,
  getBridge: async () => ({ request: { apiFetch: mocks.request, apiCancel: mocks.cancel } }),
}));
afterEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
});

it("cancels an owned native request and rejects promptly without exposing auth headers", async () => {
  mocks.request.mockImplementation(async () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = createDesktopFetch("https://api.test")("https://api.test/rpc/account/get", {
    method: "POST",
    headers: { cookie: "private", authorization: "private", "content-type": "application/json" },
    body: "{}",
    signal: controller.signal,
  });
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(mocks.cancel).toHaveBeenCalledWith({ id: mocks.request.mock.calls[0]![0].id });
  expect(mocks.request.mock.calls[0]![0].headers).toEqual({ "content-type": "application/json" });
});
it("rejects a pre-aborted request and an unconfigured origin without starting native work", async () => {
  const controller = new AbortController();
  controller.abort();
  const send = createDesktopFetch("https://api.test");
  await expect(
    send("https://api.test/api/auth/get-session", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(send("https://evil.test/rpc/account/get")).rejects.toThrow("origin");
  expect(mocks.request).not.toHaveBeenCalled();
});
