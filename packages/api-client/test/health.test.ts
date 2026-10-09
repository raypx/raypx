import { afterEach, expect, test, vi } from "vite-plus/test";
import { checkHealth } from "@raypx/api-client/health";

const healthyResponse = { status: "ok", service: "raypx-api" } as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pendingFetch() {
  return vi.fn<typeof fetch>((_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Health requests must be cancellable");

    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
      } else {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }
    });
  });
}

test("requests the same-origin health endpoint and returns the validated contract", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(healthyResponse));
  vi.stubGlobal("fetch", fetchMock);

  expect(await checkHealth()).toEqual(healthyResponse);
  expect(fetchMock).toHaveBeenCalledWith("/api/health", {
    method: "GET",
    headers: expect.any(Headers),
    body: undefined,
    credentials: "same-origin",
    mode: "same-origin",
    signal: expect.any(AbortSignal),
  });
});

test("reports the HTTP status when the health endpoint rejects the request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
  );

  await expect(checkHealth()).rejects.toThrow("HTTP 503");
});

test("rejects a successful response that does not match the health contract", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "ok", service: "other-service" })),
  );

  await expect(checkHealth()).rejects.toMatchObject({ kind: "invalid-response" });
});

test("propagates a failed network request", async () => {
  const error = new TypeError("Failed to fetch");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(error));

  await expect(checkHealth()).rejects.toMatchObject({ kind: "network", cause: error });
});

test.each([
  { timeoutMs: undefined, expectedTimeout: 5000 },
  { timeoutMs: 100, expectedTimeout: 100 },
])(
  "cancels a pending health request after its configured timeout $expectedTimeout",
  async ({ timeoutMs, expectedTimeout }) => {
    const timeoutController = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    vi.stubGlobal("fetch", pendingFetch());

    const request = checkHealth(timeoutMs === undefined ? undefined : { timeoutMs });
    timeoutController.abort(new DOMException("Health request timed out", "TimeoutError"));

    await expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    expect(timeout).toHaveBeenCalledWith(expectedTimeout);
  },
);

test("lets the caller cancel a pending request before its timeout", async () => {
  const controller = new AbortController();
  const fetchMock = pendingFetch();
  vi.stubGlobal("fetch", fetchMock);

  const request = checkHealth({ signal: controller.signal });
  controller.abort();

  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

test("preserves cancellation when the caller signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal("fetch", pendingFetch());

  await expect(checkHealth({ signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
});
