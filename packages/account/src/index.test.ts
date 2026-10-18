import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import { readAccount } from "./index";

const profile = { id: "u1", email: "a@example.test", name: "Ada" };
afterEach(() => vi.useRealTimers());
describe("account reads", () => {
  it("reads only through the injected API client", async () => {
    const client = createApiClient({ fetch: async () => Response.json({ json: profile }) });
    expect(await readAccount(client)).toEqual({ status: "signed-in", account: profile });
  });

  it("distinguishes unauthorized responses from connection failures", async () => {
    const client = createApiClient({
      fetch: async () =>
        Response.json(
          { json: { defined: false, code: "UNAUTHORIZED", message: "private diagnostic" } },
          { status: 401 },
        ),
    });
    expect(await readAccount(client)).toEqual({ status: "signed-out" });
    const offline = createApiClient({
      fetch: async () => {
        throw new Error("private connection details");
      },
    });
    expect(await readAccount(offline)).toEqual({ status: "unavailable" });
  });

  it("propagates caller cancellation and avoids a request if already aborted", async () => {
    const fetch = vi.fn(async () => Response.json({ json: profile }));
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      readAccount(createApiClient({ fetch }), { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a slow request without exposing a transport error", async () => {
    vi.useFakeTimers();
    const client = createApiClient({
      fetch: async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    });
    const result = readAccount(client);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ status: "unavailable" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
