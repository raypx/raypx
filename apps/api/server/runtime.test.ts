import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const close = vi.fn(async () => undefined);
  const fetch = vi.fn(async () => new Response("ok"));
  return {
    close,
    fetch,
    createApiRuntime: vi.fn(async () => ({ app: { fetch }, close })),
  };
});

vi.mock("./api/index.js", () => ({
  createApiRuntime: mocks.createApiRuntime,
}));

vi.mock("@voidmix/shared/logger", () => ({
  configureLogger: vi.fn(() => ({ service: "api" })),
  logger: vi.fn(() => ({ error: vi.fn(), emit: vi.fn(), set: vi.fn() })),
}));

describe("standalone API runtime host", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates one shared runtime and closes it through the host lifecycle", async () => {
    const { closeApiRuntime, getApiRuntime } = await import("./runtime.js");

    const first = await getApiRuntime();
    const second = await getApiRuntime();
    await closeApiRuntime();

    expect(first).toBe(second);
    expect(mocks.createApiRuntime).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("forwards Nitro Web requests to the shared runtime", async () => {
    const { default: handler } = await import("./app.js");
    const request = new Request("http://localhost:3002/health");

    const response = await handler.fetch(request);

    expect(await response.text()).toBe("ok");
    expect(mocks.fetch).toHaveBeenCalledWith(request);
  });
});
