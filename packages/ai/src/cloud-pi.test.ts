import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createCloudPiAgent, normalizeModelUsage, type ModelCallHooks } from "./cloud-pi.js";

const mock = vi.hoisted(() => ({
  listener: (_event: unknown) => {},
  settings: vi.fn(),
  create: vi.fn(),
  loader: vi.fn(),
  auth: true,
  promptFailure: false,
  requests: [] as { maxRetries?: number; maxTokens?: number }[],
  agent: {
    streamFunction: async (
      _model: unknown,
      _context: unknown,
      _options?: { maxRetries?: number; maxTokens?: number },
    ) => ({
      result: async () => ({ usage: { input: 20, output: 10, cacheRead: 0, cacheWrite: 0 } }),
    }),
  },
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => {},
      getPhysicalModel: () => ({
        id: "model",
        provider: "provider",
        maxTokens: 16000,
        cost: { input: 2, output: 6, cacheRead: 0.2, cacheWrite: 2.5 },
      }),
      getAuth: async () => (mock.auth ? {} : undefined),
    }),
  },
  SettingsManager: {
    inMemory: (settings: unknown) => {
      mock.settings(settings);
      return {};
    },
  },
  DefaultResourceLoader: class {
    constructor(options: unknown) {
      mock.loader(options);
    }
    async reload() {}
  },
  SessionManager: { inMemory: () => ({}) },
  createAgentSession: async (options: unknown) => {
    mock.create(options);
    return {
      session: {
        agent: mock.agent,
        async prompt() {
          const model = {
            id: "model",
            provider: "provider",
            maxTokens: 16000,
            cost: { input: 2, output: 6, cacheRead: 0.2, cacheWrite: 2.5 },
          };
          // Main, retry, and compaction all call the same stream function.
          for (let index = 0; index < 3; index++) await mock.agent.streamFunction(model, {}, {});
          if (mock.promptFailure) throw new Error("Provider interrupted");
          mock.listener({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Done" }],
              stopReason: "stop",
              usage: { input: 20, output: 10 },
            },
          });
        },
        subscribe(listener: (event: unknown) => void) {
          mock.listener = listener;
          return () => {};
        },
        abort: async () => {},
        dispose() {},
        steer: async () => {},
      },
    };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth = true;
  mock.promptFailure = false;
  mock.requests = [];
  mock.agent.streamFunction = async (_model, _context, options) => {
    mock.requests.push(options ?? {});
    return {
      result: async () => ({ usage: { input: 20, output: 10, cacheRead: 0, cacheWrite: 0 } }),
    };
  };
});

it("meters every model attempt, disables provider retries/discovery and uses explicit tools", async () => {
  const reserve = vi.fn<ModelCallHooks["reserve"]>(async () => {}),
    start = vi.fn<ModelCallHooks["start"]>(async () => {}),
    settle = vi.fn<ModelCallHooks["settle"]>(async () => {});
  const events: unknown[] = [];
  const result = await createCloudPiAgent({ model: { provider: "provider", id: "model" } }).run({
    cwd: "/tmp/isolated",
    prompt: "Research",
    systemPrompt: "Trusted tools only.",
    tools: [
      {
        name: "search",
        description: "Search",
        parameters: { type: "object", properties: {} },
        execute: async () => [],
      },
    ],
    maxOutputTokens: 1000,
    signal: new AbortController().signal,
    hooks: { reserve, start, settle },
    onEvent: async (event) => {
      events.push(event);
    },
  });
  expect(result).toEqual({ type: "completed", text: "Done" });
  expect(reserve).toHaveBeenCalledTimes(3);
  expect(start).toHaveBeenCalledTimes(3);
  expect(reserve).toHaveBeenCalledWith(
    expect.objectContaining({
      pricing: {
        inputPerMillion: 2,
        outputPerMillion: 6,
        cacheReadPerMillion: 0.2,
        cacheWritePerMillion: 2.5,
      },
    }),
  );
  expect(settle).toHaveBeenCalledTimes(3);
  expect(new Set(reserve.mock.calls.map(([input]) => input.callId)).size).toBe(3);
  expect(mock.requests).toEqual([
    { maxTokens: 1000, maxRetries: 0 },
    { maxTokens: 1000, maxRetries: 0 },
    { maxTokens: 1000, maxRetries: 0 },
  ]);
  expect(mock.settings).toHaveBeenCalledWith(
    expect.objectContaining({
      cacheWarming: "off",
      extensions: [],
      packages: [],
      retry: expect.objectContaining({ provider: { maxRetries: 0 } }),
    }),
  );
  expect(mock.loader).toHaveBeenCalledWith(
    expect.objectContaining({ noExtensions: true, noSkills: true, noContextFiles: true }),
  );
  expect(mock.create).toHaveBeenCalledWith(
    expect.objectContaining({ noTools: "builtin", tools: ["search"] }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "message_completed",
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: null, cacheWriteTokens: null },
    }),
  );
});
it("waits for durable model settlements before returning a failed prompt", async () => {
  mock.promptFailure = true;
  let settled = 0;
  const operation = createCloudPiAgent({ model: { provider: "provider", id: "model" } }).run({
    cwd: "/tmp/isolated",
    prompt: "Research",
    systemPrompt: "",
    tools: [],
    maxOutputTokens: 1000,
    signal: new AbortController().signal,
    onEvent: async () => {},
    hooks: {
      reserve: async () => {},
      start: async () => {},
      settle: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        settled++;
      },
    },
  });
  await expect(operation).rejects.toThrow("interrupted");
  expect(settled).toBe(3);
});
it("refuses missing credentials before issuing a model request", async () => {
  mock.auth = false;
  const reserve = vi.fn(async () => {});
  await expect(
    createCloudPiAgent({ model: { provider: "provider", id: "model" } }).run({
      cwd: "/tmp/isolated",
      prompt: "Go",
      systemPrompt: "",
      tools: [],
      maxOutputTokens: 1000,
      signal: new AbortController().signal,
      onEvent: async () => {},
      hooks: { reserve, start: async () => {}, settle: async () => {} },
    }),
  ).rejects.toThrow("credentials");
  expect(reserve).not.toHaveBeenCalled();
});
it("keeps unknown usage null and rejects non-finite/negative values", () => {
  expect(normalizeModelUsage(null)).toEqual({
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
  });
  expect(normalizeModelUsage({ input: 0, output: -1, cacheRead: Infinity })).toEqual({
    inputTokens: 0,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
  });
});
