import { beforeEach, expect, it, vi } from "vite-plus/test";
import { collectRun, createPiProvider } from "./index.js";

const sdk = vi.hoisted(() => ({
  listener: (_event: unknown) => {},
  unsubscribe: vi.fn(),
  abort: vi.fn(async () => {}),
  prompt: vi.fn<(text: string) => Promise<void>>(),
  steer: vi.fn<(text: string) => Promise<"handled" | "queued">>(),
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  ModelRuntime: { create: async () => ({}) },
  createAgentSession: async () => ({
    session: {
      sessionId: "pi-1",
      prompt: sdk.prompt,
      abort: sdk.abort,
      steer: sdk.steer,
      subscribe: (listener: typeof sdk.listener) => {
        sdk.listener = listener;
        return sdk.unsubscribe;
      },
    },
  }),
}));
beforeEach(() => vi.clearAllMocks());

async function setup(signal?: AbortSignal) {
  const provider = createPiProvider();
  const session = await provider.createSession({
    projectId: "p1",
    role: { id: "editor", instructions: "Review" },
  });
  return {
    provider,
    input: {
      session,
      project: { id: "p1", title: "Film" },
      prompt: "Go",
      ...(signal ? { signal } : {}),
    },
  };
}

it("drains retry events and completes when the prompt settles", async () => {
  sdk.prompt.mockImplementation(async () => {
    sdk.listener({ type: "message_update", assistantMessageEvent: null });
    sdk.listener({ type: "agent_end", willRetry: true });
    sdk.listener({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello" },
    });
    sdk.listener({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
        stopReason: "stop",
      },
    });
    sdk.listener({ type: "agent_settled" });
  });
  const { provider, input } = await setup();
  expect(await collectRun(provider, input)).toEqual([
    { type: "text_delta", text: "Hello" },
    { type: "message_completed", text: "Hello", stopReason: "stop" },
    { type: "completed", text: "Hello" },
  ]);
  expect(sdk.prompt).toHaveBeenCalledWith("[Agent role: editor]\nReview\nGo");
  expect(sdk.unsubscribe).toHaveBeenCalledOnce();
});
it("does not treat agent_end or a failed assistant as successful completion", async () => {
  sdk.prompt.mockImplementation(async () => {
    sdk.listener({ type: "agent_end", willRetry: true });
    sdk.listener({
      type: "message_end",
      message: { role: "assistant", content: [], stopReason: "error" },
    });
    sdk.listener({ type: "agent_end", willRetry: false });
    sdk.listener({ type: "agent_settled" });
  });
  const { provider, input } = await setup();
  const events = await collectRun(provider, input);
  expect(events.map((event) => event.type)).toEqual(["message_completed", "failed"]);
});
it("uses finalized content rather than an incomplete stream", async () => {
  sdk.prompt.mockImplementation(async () => {
    sdk.listener({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Part" },
    });
    sdk.listener({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Final" }],
        stopReason: "stop",
      },
    });
    sdk.listener({ type: "agent_settled" });
  });
  const { provider, input } = await setup();
  expect((await collectRun(provider, input)).at(-1)).toEqual({ type: "completed", text: "Final" });
});
it("delivers prompt failures and releases the subscription", async () => {
  sdk.prompt.mockRejectedValueOnce(new Error("failed"));
  const { provider, input } = await setup();
  expect(await collectRun(provider, input)).toEqual([{ type: "failed", message: "failed" }]);
  expect(sdk.unsubscribe).toHaveBeenCalledOnce();
});
it.each(["handled", "queued"] as const)(
  "accepts Pi steering disposition %s",
  async (disposition) => {
    sdk.steer.mockResolvedValueOnce(disposition);
    const { provider, input } = await setup();
    await expect(provider.steer!(input.session.id, "Change direction")).resolves.toBeUndefined();
    expect(sdk.steer).toHaveBeenCalledWith("Change direction");
  },
);
it("propagates Pi steering failures", async () => {
  sdk.steer.mockRejectedValueOnce(new Error("Cannot steer"));
  const { provider, input } = await setup();
  await expect(provider.steer!(input.session.id, "Change direction")).rejects.toThrow(
    "Cannot steer",
  );
});
it.each([true, false])("cancels a run (already aborted: %s)", async (alreadyAborted) => {
  const controller = new AbortController();
  if (alreadyAborted) controller.abort();
  sdk.prompt.mockImplementation(async () => {
    controller.abort();
  });
  const { provider, input } = await setup(controller.signal);
  expect(await collectRun(provider, input)).toEqual([{ type: "cancelled" }]);
  expect(sdk.abort).toHaveBeenCalledOnce();
  expect(sdk.prompt).toHaveBeenCalledTimes(alreadyAborted ? 0 : 1);
  expect(sdk.unsubscribe).toHaveBeenCalledOnce();
});
