import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createModelGateway } from "./model-gateway.js";
import type { ModelCallHooks } from "./cloud-pi.js";
const mock = vi.hoisted(() => ({ dispatch: vi.fn(), reason: "stop" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => {},
      getAuth: async () => ({}),
      getPhysicalModel: () => ({
        id: "configured-model",
        provider: "configured-provider",
        maxTokens: 8192,
        cost: { input: 2, output: 6, cacheRead: 1, cacheWrite: 2 },
      }),
      streamSimple: (_model: unknown, _context: unknown, options: unknown) => {
        mock.dispatch(options);
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "done" };
          },
          result: async () => ({
            stopReason: mock.reason,
            usage: { input: 20, output: 10, cacheRead: 0, cacheWrite: 0 },
          }),
        };
      },
    }),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.reason = "stop";
});
const hooks = (): ModelCallHooks => ({
  reserve: vi.fn(async () => {}),
  start: vi.fn(async () => {}),
  settle: vi.fn(async () => {}),
});
it("dispatches only after durable host reservations and uses the configured model and price", async () => {
  const gateway = await createModelGateway({
    model: { provider: "configured-provider", id: "configured-model" },
    apiKey: "host-only",
  });
  const h = hooks();
  const result = await gateway.stream(
    { callId: "call", context: { messages: [] }, maxOutputTokens: 100 },
    h,
    new AbortController().signal,
  );
  await result.settled;
  expect(h.reserve).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: "configured-provider",
      model: "configured-model",
      pricing: {
        inputPerMillion: 2,
        outputPerMillion: 6,
        cacheReadPerMillion: 1,
        cacheWritePerMillion: 2,
      },
    }),
  );
  expect(h.start).toHaveBeenCalledWith("call");
  expect(h.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      started: true,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  );
  expect(mock.dispatch).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
});
it("rejects unknown tools and exhausted quotas before provider dispatch", async () => {
  const gateway = await createModelGateway({
    model: { provider: "configured-provider", id: "configured-model" },
    apiKey: "host-only",
  });
  await expect(
    gateway.stream(
      {
        callId: "call",
        context: { messages: [], tools: [{ name: "shell" }] },
        maxOutputTokens: 100,
      },
      hooks(),
      new AbortController().signal,
    ),
  ).rejects.toThrow("MODEL_TOOL_FORBIDDEN");
  const h = hooks();
  h.reserve = async () => {
    throw new Error("quota");
  };
  await expect(
    gateway.stream(
      { callId: "call", context: { messages: [] }, maxOutputTokens: 100 },
      h,
      new AbortController().signal,
    ),
  ).rejects.toThrow("quota");
  expect(mock.dispatch).not.toHaveBeenCalled();
});
it("records interrupted provider usage as unknown rather than zero", async () => {
  mock.reason = "error";
  const gateway = await createModelGateway({
    model: { provider: "configured-provider", id: "configured-model" },
    apiKey: "host-only",
  });
  const h = hooks();
  const result = await gateway.stream(
    { callId: "call", context: { messages: [] }, maxOutputTokens: 100 },
    h,
    new AbortController().signal,
  );
  await result.settled;
  expect(h.settle).toHaveBeenCalledWith({
    callId: "call",
    started: true,
    usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null },
  });
});
